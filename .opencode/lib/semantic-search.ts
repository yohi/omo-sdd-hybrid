import fs from 'fs';
import path from 'path';
import { getEmbeddings, isEmbeddingsEnabled } from './embeddings-provider';
import type { ExtractedRequirement } from './spec-parser';

export interface SemanticAnalysisResult {
  gaps: string[];
  details: {
    reqId: string;
    similarity: number;
    bestMatchFile?: string;
  }[];
}

const DEFAULT_THRESHOLD = 0.75;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

function getThreshold(): number {
  const env = process.env.SDD_EMBEDDINGS_THRESHOLD;
  if (env) {
    const val = parseFloat(env);
    if (!isNaN(val)) {
      return Math.min(1, Math.max(0, val));
    }
  }
  return DEFAULT_THRESHOLD;
}

const DEFAULT_BATCH_SIZE = 10;

function getBatchSize(): number {
  const env = process.env.SDD_EMBEDDINGS_BATCH_SIZE;
  if (env) {
    const val = parseInt(env, 10);
    if (!isNaN(val) && val > 0) {
      return val;
    }
  }
  return DEFAULT_BATCH_SIZE;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function findSemanticGaps(
  requirements: ExtractedRequirement[],
  changedFiles: string[]
): Promise<SemanticAnalysisResult> {
  const result: SemanticAnalysisResult = { gaps: [], details: [] };

  if (!isEmbeddingsEnabled()) {
    return result;
  }

  // 対象ファイルの拡張子フィルター
  const targetExtensions = ['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.prisma', '.sql'];
  const validFiles = changedFiles.filter(f => targetExtensions.includes(path.extname(f)));

  if (validFiles.length === 0 || requirements.length === 0) {
    return result;
  }

  // テキスト収集
  const reqTexts = requirements.map(r => r.description || r.id);
  const fileChunks: { file: string; text: string }[] = [];

  for (const file of validFiles) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        const chunks = chunkText(content);
        for (const c of chunks) {
          fileChunks.push({ file, text: c });
        }
      }
    } catch (e) {
      console.warn(`[SDD-SEMANTIC] Failed to read ${file}:`, e);
    }
  }

  if (fileChunks.length === 0) {
    return result;
  }

  const allTexts = [...reqTexts, ...fileChunks.map(c => c.text)];
  const batchSize = getBatchSize();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < allTexts.length; i += batchSize) {
    const batch = allTexts.slice(i, i + batchSize);
    try {
      const batchEmbeddings = await getEmbeddings(batch);
      
      if (!batchEmbeddings) {
        console.warn(`[SDD-SEMANTIC] Failed to get embeddings for batch (index ${i} to ${i + batch.length - 1})`);
        return result; // エラー時は分析スキップ
      }

      if (batchEmbeddings.length !== batch.length) {
        console.warn(`[SDD-SEMANTIC] Embeddings count mismatch in batch (expected ${batch.length}, got ${batchEmbeddings.length})`);
        return result;
      }

      allEmbeddings.push(...batchEmbeddings);
    } catch (e) {
      console.warn(`[SDD-SEMANTIC] Error processing batch (index ${i}):`, e);
      return result;
    }
  }

  if (allEmbeddings.length !== allTexts.length) {
    console.warn(`[SDD-SEMANTIC] Total embeddings count mismatch (expected ${allTexts.length}, got ${allEmbeddings.length})`);
    return result; 
  }

  const reqEmbeddings = allEmbeddings.slice(0, reqTexts.length);
  const chunkEmbeddings = allEmbeddings.slice(reqTexts.length);

  const threshold = getThreshold();

  // 類似度比較
  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i];
    const reqVec = reqEmbeddings[i];
    
    let maxSim = -1;
    let bestFile = '';

    for (let j = 0; j < chunkEmbeddings.length; j++) {
      const sim = cosineSimilarity(reqVec, chunkEmbeddings[j]);
      if (sim > maxSim) {
        maxSim = sim;
        bestFile = fileChunks[j].file;
      }
    }

    result.details.push({
      reqId: req.id,
      similarity: maxSim,
      bestMatchFile: bestFile
    });

    if (maxSim < threshold) {
      result.gaps.push(
        `要件 '${req.id}' の実装が不十分な可能性があります (類似度: ${maxSim.toFixed(2)} < ${threshold})`
      );
    }
  }

  return result;
}
