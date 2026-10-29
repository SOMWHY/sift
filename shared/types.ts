/**
 * Sift 数据实体类型。主进程 DB 层与渲染层共享（通过 IPC 契约复用）。
 */

export interface DbFile {
  id: number;
  path: string;
  hash: string | null;
  size: number | null;
  mime: string | null;
  extracted_text: string | null;
  indexed_at: string | null;
  status: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface FileTag {
  file_id: number;
  tag_id: number;
  confidence: number;
}

export interface Suggestion {
  id: number;
  file_id: number;
  proposed_tag: string;
  confidence: number;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface FeedbackEvent {
  id: number;
  suggestion_id: number;
  user_action: string;
  from_tag: string | null;
  to_tag: string | null;
  created_at: string;
}

export interface Preference {
  id: number;
  pattern: string;
  preferred_tag: string;
  weight: number;
  updated_at: string;
}

export interface OperationLogEntry {
  id: number;
  batch_id: string;
  source_path: string;
  target_path: string;
  op_type: string;
  suggestion_id: number | null;
  confidence: number | null;
  user_decision: string | null;
  created_at: string;
}

export interface UndoBatch {
  id: number;
  batch_id: string;
  undone_at: string;
  reason: string | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Provider {
  id: number;
  provider_id: string;
  base_url: string | null;
  model: string | null;
  encrypted_api_key: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export type NewFile = Omit<DbFile, 'id'>;
export type NewSuggestion = Omit<Suggestion, 'id'>;
export type NewFeedbackEvent = Omit<FeedbackEvent, 'id'>;
export type NewPreference = Omit<Preference, 'id'>;
export type NewOperationLogEntry = Omit<OperationLogEntry, 'id'>;
export type NewProvider = Omit<Provider, 'id'>;
