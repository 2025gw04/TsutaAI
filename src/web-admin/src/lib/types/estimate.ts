/**
 * 見積もり機能の型定義
 */

export type EstimatePatternType =
	| 'duration_unknown'
	| 'duration_fixed'
	| 'task_based'
	| 'budget_fixed'
	| 'phase_based'
	| 'agile'
	| 'mvp'
	| 'skill_based'
	| 'risk_based'
	| 'hybrid'
	| 'similar_project'
	| 'maintenance';

export type EstimateStatus = 'draft' | 'in_progress' | 'completed';

export type ResultType = 'optimistic' | 'standard' | 'pessimistic';

export interface Estimate {
	id: number;
	project_id?: number;
	pattern_type: EstimatePatternType;
	title: string;
	description?: string;
	status: EstimateStatus;
	created_by: number;
	created_at: string;
	updated_at: string;
	completed_at?: string;
}

export interface EstimateConversation {
	id: number;
	estimate_id: number;
	role: 'user' | 'assistant' | 'system';
	content: string;
	metadata?: any;
	created_at: string;
}

export interface EstimateParameter {
	[key: string]: any;
}

export interface EstimatePhase {
	id?: number;
	estimate_id?: number;
	phase_name: string;
	phase_order: number;
	effort: number; // 人日
	duration_days: number;
	team_size: number;
	start_date?: string;
	end_date?: string;
	dependencies?: string[];
	// AI効率化設定
	use_ai: boolean;
	ai_efficiency_ratio: number; // 0-1
	ai_efficiency_auto: boolean;
	effort_with_ai?: number;
	duration_with_ai?: number;
	// Phase 2: phase_based support
	gate_criteria?: string; // JSON形式
	deliverables?: string; // JSON形式
	// Phase 3: risk_based support
	risk_buffer_percentage?: number; // リスクバッファ（%）
	// Phase 4: hybrid support
	estimation_method?: string; // 使用した見積もり手法
}

export interface EstimateTask {
	id?: number;
	estimate_id?: number;
	task_name: string;
	task_description?: string;
	task_order: number;
	phase_id?: number;
	effort: number;
	complexity: 'low' | 'medium' | 'high';
	// AI効率化設定
	use_ai: boolean;
	ai_efficiency_ratio: number;
	ai_efficiency_auto: boolean;
	effort_with_ai?: number;
	// Phase 1: budget_fixed and mvp support
	priority?: 'must' | 'should' | 'nice'; // budget_fixed用
	is_mvp_core?: boolean; // mvp用
	// Phase 3: skill_based support
	required_skill_level?: 'senior' | 'middle' | 'junior'; // skill_based用
}

export interface EstimateResult {
	id: number;
	estimate_id: number;
	result_type: ResultType;
	total_effort: number;
	duration_days: number;
	team_size: number;
	total_cost?: number;
	confidence_level: number;
	breakdown?: {
		phases?: Array<{
			name: string;
			effort: number;
			duration: number;
			useAi: boolean;
			aiEfficiencyRatio?: number;
		}>;
		aiSavings?: number;
	};
	recommendations?: any;
	created_at: string;
}

export interface EstimatePattern {
	id: EstimatePatternType;
	name: string;
	description: string;
	icon: string;
	category: 'basic' | 'project' | 'optimization' | 'special';
}

// Phase 2: phase_based pattern
export interface EstimatePhaseGate {
	id?: number;
	estimate_id: number;
	phase_id: number;
	gate_name: string;
	criteria: string; // JSON形式
	status: 'pending' | 'passed' | 'failed';
	reviewed_at?: string;
	created_at?: string;
}

// Phase 2: agile pattern
export interface EstimateUserStory {
	id?: number;
	estimate_id: number;
	epic?: string;
	user_story: string;
	story_points?: number;
	sprint_number?: number;
	priority?: number;
	acceptance_criteria?: string; // JSON形式
	created_at?: string;
}

// Phase 4: similar_project pattern
export interface EstimateHistoricalProject {
	id?: number;
	project_name: string;
	project_description?: string;
	technology_stack?: string; // JSON形式
	total_effort: number; // 総工数（人日）
	duration_days: number; // 期間（日数）
	team_size: number; // チーム人数
	actual_cost?: number; // 実コスト
	success_rating?: number; // 成功度（1-5）
	lessons_learned?: string; // 教訓
	completed_at?: string; // 完了日
	created_at?: string;
}

// Phase 4: maintenance pattern
export interface EstimateMaintenanceItem {
	id?: number;
	estimate_id: number;
	item_type: 'incident' | 'maintenance' | 'minor_change' | 'inquiry';
	item_name: string;
	monthly_frequency: number; // 月次発生頻度
	hours_per_occurrence: number; // 1件あたり時間
	priority?: string; // 優先度
	use_ai: boolean;
	ai_efficiency_ratio: number;
	created_at?: string;
}
