/**
 * spec-parser.ts
 * 
 * requirements.md と design.md から構造化データを抽出するユーティリティ
 * Kiro統合の深化（意味的検証）のための基盤モジュール
 */

/**
 * 要件を表す構造体
 */
export interface ExtractedRequirement {
  id: string;                    // "REQ-001" 形式、またはセクション番号
  description: string;           // 要件の説明
  acceptanceCriteria: string[];  // 受入条件（箇条書きから抽出）
}

/**
 * 設計情報を表す構造体
 */
export interface ExtractedDesign {
  impactedFiles: string[];       // 影響を受けるファイルパス
  components: string[];          // コンポーネント名
  dependencies: string[];        // 依存関係
}

/**
 * requirements.md の内容から要件を抽出
 * 
 * 対応するMarkdown形式:
 * - "## REQ-001: タイトル" 形式のヘッダー
 * - "### 受入条件" セクションの箇条書き
 * - "## 1. タイトル" 形式の番号付きヘッダー
 */
export function extractRequirements(content: string): ExtractedRequirement[] {
  if (!content || content.trim() === '') {
    return [];
  }

  const requirements: ExtractedRequirement[] = [];
  const lines = content.split('\n');
  
  // REQ-XXX 形式または番号形式のヘッダーを検出
  const headerPattern = /^##\s+(?:(REQ-\d+):\s*(.+)|((\d+)\.)\s*(.+))$/i;
  
  let currentReq: ExtractedRequirement | null = null;
  let inAcceptanceCriteria = false;
  let descriptionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 新しいヘッダーを検出
    const headerMatch = line.match(headerPattern);
    if (headerMatch) {
      // 前の要件を保存
      if (currentReq) {
        currentReq.description = descriptionLines.join('\n').trim();
        requirements.push(currentReq);
      }
      
      // 新しい要件を開始
      if (headerMatch[1]) {
        // REQ-XXX 形式
        currentReq = {
          id: headerMatch[1],
          description: '',
          acceptanceCriteria: []
        };
      } else if (headerMatch[4]) {
        // 番号形式
        currentReq = {
          id: headerMatch[4],
          description: '',
          acceptanceCriteria: []
        };
      }
      
      descriptionLines = [];
      inAcceptanceCriteria = false;
      continue;
    }
    
    // 受入条件セクションを検出
    const acceptanceMatch = line.match(/^###\s*(?:受入条件|Acceptance\s*Criteria)/i);
    if (acceptanceMatch && currentReq) {
      // 受入条件セクションに入る前にdescriptionを確定
      currentReq.description = descriptionLines.join('\n').trim();
      descriptionLines = [];
      inAcceptanceCriteria = true;
      continue;
    }
    
    // 別のH3セクションを検出したら受入条件モードを終了
    if (line.match(/^###\s+/) && inAcceptanceCriteria) {
      inAcceptanceCriteria = false;
    }
    
    // 受入条件の箇条書きを抽出
    if (inAcceptanceCriteria && currentReq) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (bulletMatch) {
        currentReq.acceptanceCriteria.push(bulletMatch[1].trim());
      }
      continue;
    }
    
    // 説明文を収集
    if (currentReq && !line.match(/^##/)) {
      descriptionLines.push(line);
    }
  }
  
  // 最後の要件を保存
  if (currentReq) {
    if (descriptionLines.length > 0 && !currentReq.description) {
      currentReq.description = descriptionLines.join('\n').trim();
    }
    requirements.push(currentReq);
  }
  
  return requirements;
}

/**
 * design.md の内容から設計情報を抽出
 * 
 * 対応するMarkdown形式:
 * - "## Impacted Files" セクションのファイルパス
 * - バッククォートで囲まれたパス（`src/auth/login.ts`）
 * - "## Components" セクションのリスト
 * - "## Dependencies" セクションのリスト
 */
export function extractDesign(content: string): ExtractedDesign {
  const result: ExtractedDesign = {
    impactedFiles: [],
    components: [],
    dependencies: []
  };

  if (!content || content.trim() === '') {
    return result;
  }

  const lines = content.split('\n');
  
  type SectionType = 'impactedFiles' | 'components' | 'dependencies' | null;
  let currentSection: SectionType = null;

  for (const line of lines) {
    // セクションヘッダーを検出
    const sectionMatch = line.match(/^##\s+(.+)$/i);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].toLowerCase().trim();
      
      if (sectionName.includes('impacted') && sectionName.includes('file')) {
        currentSection = 'impactedFiles';
      } else if (sectionName.includes('component')) {
        currentSection = 'components';
      } else if (sectionName.includes('dependenc')) {
        currentSection = 'dependencies';
      } else {
        currentSection = null;
      }
      continue;
    }

    // 現在のセクションに応じてデータを抽出
    if (currentSection) {
      // バッククォート内のパスを抽出
      const backtickMatches = line.matchAll(/`([^`]+)`/g);
      for (const match of backtickMatches) {
        const value = match[1].trim();
        if (value && !result[currentSection].includes(value)) {
          result[currentSection].push(value);
        }
      }

      // 箇条書きから抽出（バッククォートがない場合）
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (bulletMatch) {
        // バッククォートがない場合のみ追加
        const rawValue = bulletMatch[1].trim();
        // バッククォートで囲まれていない値を抽出
        if (!rawValue.includes('`')) {
          if (!result[currentSection].includes(rawValue)) {
            result[currentSection].push(rawValue);
          }
        }
      }
    }
  }

  return result;
}
