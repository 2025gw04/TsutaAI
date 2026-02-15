-- users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- projects
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('planning', 'active', 'completed', 'cancelled')),
    created_by INTEGER,
    main_deliverable TEXT DEFAULT '',
    milestone TEXT DEFAULT '',
    health_score INTEGER DEFAULT 0,
    last_health_score_update TEXT,
    current_sprint_id INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (current_sprint_id) REFERENCES sprint_goals(id)
);

-- project members
CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member' CHECK(role IN ('owner', 'member', 'viewer')),
    added_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(project_id, user_id)
);

-- project milestones
CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    due_date TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER,
    estimated_hours REAL,
    actual_hours REAL DEFAULT 0,
    priority TEXT CHECK(priority IN ('low', 'medium', 'high')),
    status TEXT NOT NULL CHECK(status IN ('todo', 'in_progress', 'completed', 'cancelled')),
    progress INTEGER DEFAULT 0,
    due_date TEXT,
    start_date TEXT,
    end_date TEXT,
    actual_start_date TEXT,
    actual_end_date TEXT,
    deliverable TEXT DEFAULT '',
    parent_task_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    dependencies TEXT,
    task_key TEXT,
    story_points INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- task comments
CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- task attachments
CREATE TABLE IF NOT EXISTS task_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    uploaded_by INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

-- task activity log
CREATE TABLE IF NOT EXISTS task_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER,
    action_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- work logs
CREATE TABLE IF NOT EXISTS work_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_minutes INTEGER,
    activity_type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- daily reports
CREATE TABLE IF NOT EXISTS daily_reports (
    report_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    summary TEXT NOT NULL,
    satisfaction_level INTEGER CHECK(satisfaction_level BETWEEN 1 AND 5),
    achievement_rate INTEGER CHECK(achievement_rate BETWEEN 0 AND 100),
    focus_level INTEGER CHECK(focus_level BETWEEN 0 AND 100),
    difficulty_level INTEGER CHECK(difficulty_level BETWEEN 0 AND 100),
    learning_level INTEGER CHECK(learning_level BETWEEN 0 AND 100),
    comment TEXT,
    ai_generated INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ai predictions
CREATE TABLE IF NOT EXISTS ai_predictions (
    prediction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    prediction_type TEXT NOT NULL,
    risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high')),
    prediction_content TEXT NOT NULL,
    recommended_action TEXT,
    is_resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    related_entity_type TEXT,
    related_entity_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- user skills
CREATE TABLE IF NOT EXISTS user_skills (
    skill_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    skill_name TEXT NOT NULL,
    skill_level INTEGER NOT NULL CHECK(skill_level BETWEEN 0 AND 10),
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, skill_name)
);

-- skill growth history
CREATE TABLE IF NOT EXISTS skill_growth_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    skill_name TEXT NOT NULL,
    skill_level INTEGER NOT NULL CHECK(skill_level BETWEEN 0 AND 10),
    recorded_date TEXT NOT NULL,
    change_reason TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    metric_date TEXT NOT NULL,
    task_completion_rate REAL DEFAULT 0,
    bug_rate REAL DEFAULT 0,
    help_count INTEGER DEFAULT 0,
    focus_level_avg REAL DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    tasks_total INTEGER DEFAULT 0,
    estimated_vs_actual_ratio REAL DEFAULT 1.0,
    avg_task_duration_hours REAL DEFAULT 0,
    team_avg_duration_hours REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, metric_date)
);

-- member contributions
CREATE TABLE IF NOT EXISTS member_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contribution_date TEXT NOT NULL,
    contribution_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    impact_level TEXT CHECK(impact_level IN ('low', 'medium', 'high')) DEFAULT 'medium',
    project_id INTEGER,
    task_id INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- growth goals
CREATE TABLE IF NOT EXISTS growth_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    goal_title TEXT NOT NULL,
    goal_description TEXT,
    target_skill TEXT,
    target_level INTEGER CHECK(target_level BETWEEN 0 AND 10),
    estimated_duration_weeks INTEGER,
    status TEXT CHECK(status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
    progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    ai_generated INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- activity logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id INTEGER,
    mouse_clicks INTEGER DEFAULT 0,
    mouse_wheel INTEGER DEFAULT 0,
    key_presses INTEGER DEFAULT 0,
    active_window TEXT,
    process_name TEXT,
    activity_score REAL DEFAULT 0,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- vacations
CREATE TABLE IF NOT EXISTS vacations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    vacation_type TEXT DEFAULT '有給休暇',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- user prompts
CREATE TABLE IF NOT EXISTS user_prompts (
    user_prompt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    prompt_name TEXT NOT NULL,
    responsibility TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- project summaries (AI generated)
CREATE TABLE IF NOT EXISTS project_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL UNIQUE,
    progress_percentage INTEGER DEFAULT 0,
    current_phase TEXT,
    summary_text TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- project snapshots (AI alert history)
CREATE TABLE IF NOT EXISTS project_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    snapshot_data TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- dashboard alerts (AI generated)
CREATE TABLE IF NOT EXISTS dashboard_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    severity TEXT CHECK(severity IN ('low', 'medium', 'high')),
    type TEXT DEFAULT 'warning',
    is_read INTEGER DEFAULT 0,
    title TEXT,
    message TEXT NOT NULL,
    details TEXT,
    related_task_id INTEGER,
    alert_hash TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'resolved', 'archived')),
    resolved_at TEXT,
    auto_resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (related_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- sentiment analysis (AI generated)
CREATE TABLE IF NOT EXISTS sentiment_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    overall_score REAL NOT NULL,
    summary TEXT NOT NULL,
    positive_keywords TEXT NOT NULL,
    negative_keywords TEXT NOT NULL,
    comments_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- personal tasks
CREATE TABLE IF NOT EXISTS personal_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    report_notes TEXT DEFAULT '',
    priority TEXT DEFAULT 'Medium' CHECK(priority IN ('High', 'Medium', 'Low')),
    status TEXT DEFAULT 'not-started' CHECK(status IN ('not-started', 'in-progress', 'done', 'on-hold')),
    progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
    estimated_minutes INTEGER DEFAULT 0,
    actual_minutes INTEGER DEFAULT 0,
    start_date TEXT DEFAULT '',
    due_date TEXT DEFAULT '',
    completed_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- project health scores
CREATE TABLE IF NOT EXISTS project_health_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    health_score INTEGER CHECK(health_score BETWEEN 0 AND 100),
    score_date TEXT NOT NULL,
    -- Score components
    progress_score INTEGER DEFAULT 0,
    deadline_score INTEGER DEFAULT 0,
    team_morale_score INTEGER DEFAULT 0,
    blocker_score INTEGER DEFAULT 0,
    velocity_score INTEGER DEFAULT 0,
    -- AI analysis
    ai_analysis TEXT,
    risk_factors TEXT,
    recommendations TEXT,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- progress predictions
CREATE TABLE IF NOT EXISTS progress_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    prediction_date TEXT NOT NULL,

    -- 現在の進捗状況
    current_progress INTEGER DEFAULT 0,  -- 0-100%

    -- AI予測
    predicted_completion_date TEXT,  -- 予測完了日
    completion_probability REAL,  -- 完了確率（0.0-1.0）
    risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high')),  -- リスクレベル

    -- 活動ベースの分析
    avg_activity_score REAL,  -- 平均アクティビティスコア
    total_work_hours REAL,  -- 累積作業時間（推定）
    daily_progress_rate REAL,  -- 1日あたりの進捗率

    -- AI提案
    ai_suggestion TEXT,  -- 進捗改善提案
    bottleneck_analysis TEXT,  -- ボトルネック分析
    resource_recommendation TEXT,  -- リソース推奨

    -- メタ情報
    confidence_score REAL,  -- 予測の信頼度（0.0-1.0）
    is_on_track INTEGER DEFAULT 1,  -- 予定通りか（0=遅延, 1=順調）
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),

    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- burndown data
CREATE TABLE IF NOT EXISTS burndown_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    -- Planned values
    planned_remaining_tasks INTEGER DEFAULT 0,
    planned_remaining_hours REAL DEFAULT 0,
    -- Actual values
    actual_remaining_tasks INTEGER DEFAULT 0,
    actual_remaining_hours REAL DEFAULT 0,
    -- Completion actuals
    completed_tasks_count INTEGER DEFAULT 0,
    completed_hours REAL DEFAULT 0,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, date)
);

-- critical path tasks
CREATE TABLE IF NOT EXISTS critical_path_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    task_id INTEGER NOT NULL,
    analysis_date TEXT NOT NULL,
    -- Critical path analysis
    is_critical INTEGER DEFAULT 0,
    slack_days REAL DEFAULT 0,
    earliest_start TEXT,
    latest_start TEXT,
    earliest_finish TEXT,
    latest_finish TEXT,
    -- Dependencies
    blocking_task_count INTEGER DEFAULT 0,
    blocked_by_count INTEGER DEFAULT 0,
    dependency_chain_length INTEGER DEFAULT 0,
    -- AI analysis
    impact_analysis TEXT,
    risk_assessment TEXT,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(project_id, task_id, analysis_date)
);


-- hourly activity summary (desktop app monitoring)
CREATE TABLE IF NOT EXISTS hourly_activity_summary (
    summary_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hour_start TEXT NOT NULL,
    hour_end TEXT NOT NULL,
    -- Activity metrics
    mouse_clicks INTEGER DEFAULT 0,
    key_presses INTEGER DEFAULT 0,
    mouse_wheel_scrolls INTEGER DEFAULT 0,
    total_active_seconds INTEGER DEFAULT 0,
    top_windows TEXT,  -- JSON
    -- File changes
    file_changes_count INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    -- Analysis
    activity_intensity TEXT DEFAULT 'low' CHECK(activity_intensity IN ('low', 'medium', 'high', 'Low', 'Medium', 'High')),
    avg_cpu_usage REAL DEFAULT 0,
    avg_memory_mb REAL DEFAULT 0,
    -- AI analysis
    ai_analysis_status TEXT DEFAULT 'pending' CHECK(ai_analysis_status IN ('pending', 'completed', 'failed')),
    ai_analysis_result TEXT,  -- JSON
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- hourly activity summary (desktop app monitoring)
CREATE TABLE IF NOT EXISTS hourly_activity_summary (
    summary_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hour_start TEXT NOT NULL,
    hour_end TEXT NOT NULL,
    -- Activity metrics
    mouse_clicks INTEGER DEFAULT 0,
    key_presses INTEGER DEFAULT 0,
    mouse_wheel_scrolls INTEGER DEFAULT 0,
    total_active_seconds INTEGER DEFAULT 0,
    top_windows TEXT,  -- JSON
    -- File changes
    file_changes_count INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    -- Analysis
    activity_intensity TEXT DEFAULT 'low' CHECK(activity_intensity IN ('low', 'medium', 'high', 'Low', 'Medium', 'High')),
    avg_cpu_usage REAL DEFAULT 0,
    avg_memory_mb REAL DEFAULT 0,
    -- AI analysis
    ai_analysis_status TEXT DEFAULT 'pending' CHECK(ai_analysis_status IN ('pending', 'completed', 'failed')),
    ai_analysis_result TEXT,  -- JSON
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- help requests
CREATE TABLE IF NOT EXISTS help_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    -- Request content
    request_title TEXT NOT NULL,
    request_description TEXT,
    urgency TEXT CHECK(urgency IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    -- AI-generated context
    ai_context_summary TEXT,
    problem_type TEXT,
    detected_issues TEXT,
    -- Status
    status TEXT CHECK(status IN ('open', 'assigned', 'in_progress', 'resolved', 'cancelled')) DEFAULT 'open',
    -- Assignment
    assigned_to INTEGER,
    assigned_at TEXT,
    -- Resolution
    resolved_at TEXT,
    resolution_notes TEXT,
    effectiveness INTEGER CHECK(effectiveness BETWEEN 1 AND 5),
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- help request suggestions
CREATE TABLE IF NOT EXISTS help_request_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    help_request_id INTEGER NOT NULL,
    suggested_user_id INTEGER NOT NULL,
    -- Matching analysis
    skill_match_score REAL DEFAULT 0,
    availability_score REAL DEFAULT 0,
    experience_score REAL DEFAULT 0,
    total_match_score REAL DEFAULT 0,
    -- AI analysis
    ai_reasoning TEXT,
    recommended_approach TEXT,
    -- Ranking
    suggestion_rank INTEGER,
    -- Status
    was_accepted INTEGER DEFAULT 0,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (help_request_id) REFERENCES help_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (suggested_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(help_request_id, suggested_user_id)
);

-- team member sprint performance
CREATE TABLE IF NOT EXISTS team_member_sprint_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sprint_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    -- Performance metrics
    completed_tasks INTEGER DEFAULT 0,
    completed_story_points INTEGER DEFAULT 0,
    total_work_hours REAL DEFAULT 0,
    avg_task_completion_time REAL DEFAULT 0,
    -- Contribution
    contribution_percentage REAL DEFAULT 0,
    velocity REAL DEFAULT 0,
    -- Quality metrics
    reopened_tasks INTEGER DEFAULT 0,
    blocked_tasks INTEGER DEFAULT 0,
    -- Ranking
    performance_rank INTEGER,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (sprint_id) REFERENCES sprint_goals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(sprint_id, user_id)
);

-- mental health logs
CREATE TABLE IF NOT EXISTS mental_health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    mood INTEGER CHECK(mood BETWEEN 1 AND 5),
    stress_level INTEGER CHECK(stress_level BETWEEN 1 AND 5),
    has_blocker INTEGER DEFAULT 0,
    blocker_details TEXT,
    need_support INTEGER DEFAULT 0,
    support_details TEXT,
    ai_advice TEXT,
    manager_comment TEXT,
    manager_id INTEGER,
    commented_at TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(user_id, report_date)
);

-- sprint goals
CREATE TABLE IF NOT EXISTS sprint_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    sprint_name TEXT NOT NULL,
    sprint_number INTEGER,
    -- Period
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    -- Goals
    goal_description TEXT NOT NULL,
    target_story_points INTEGER DEFAULT 0,
    target_task_count INTEGER DEFAULT 0,
    -- Status
    status TEXT CHECK(status IN ('planning', 'active', 'completed', 'cancelled')) DEFAULT 'planning',
    -- Actual performance
    actual_story_points INTEGER DEFAULT 0,
    actual_task_count INTEGER DEFAULT 0,
    completed_story_points INTEGER DEFAULT 0,
    completed_task_count INTEGER DEFAULT 0,
    -- AI analysis
    achievability_score REAL,
    ai_analysis TEXT,
    -- Metadata
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- sprint progress
CREATE TABLE IF NOT EXISTS sprint_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sprint_id INTEGER NOT NULL,
    progress_date TEXT NOT NULL,
    -- Progress metrics
    completed_story_points INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    remaining_story_points INTEGER DEFAULT 0,
    remaining_tasks INTEGER DEFAULT 0,
    -- Momentum metrics
    daily_velocity REAL DEFAULT 0,
    momentum_score REAL DEFAULT 0,
    trend TEXT CHECK(trend IN ('accelerating', 'steady', 'slowing', 'stalled')),
    -- Predictions
    predicted_completion_date TEXT,
    on_track INTEGER DEFAULT 1,
    -- Metadata
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (sprint_id) REFERENCES sprint_goals(id) ON DELETE CASCADE,
    UNIQUE(sprint_id, progress_date)
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_actual_start_date ON tasks(actual_start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_actual_end_date ON tasks(actual_end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(start_date, end_date, actual_start_date, actual_end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_key ON tasks(task_key) WHERE task_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_task_key_lookup ON tasks(task_key);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_log_task_id ON task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_user_id ON work_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_task_id ON work_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_vacations_user_id ON vacations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prompts_user_id ON user_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_id ON personal_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_status ON personal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_due_date ON personal_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_project_health_scores_project_id ON project_health_scores(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_predictions_task ON progress_predictions(task_id);
CREATE INDEX IF NOT EXISTS idx_progress_predictions_user ON progress_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_predictions_date ON progress_predictions(prediction_date);
CREATE INDEX IF NOT EXISTS idx_progress_predictions_risk ON progress_predictions(risk_level);
CREATE INDEX IF NOT EXISTS idx_progress_predictions_on_track ON progress_predictions(is_on_track);
CREATE INDEX IF NOT EXISTS idx_mental_health_logs_user_date ON mental_health_logs(user_id, report_date);
CREATE INDEX IF NOT EXISTS idx_mental_health_logs_need_support ON mental_health_logs(need_support);
CREATE INDEX IF NOT EXISTS idx_mental_health_logs_stress ON mental_health_logs(stress_level);
CREATE INDEX IF NOT EXISTS idx_sprint_goals_project_id ON sprint_goals(project_id);
CREATE INDEX IF NOT EXISTS idx_sprint_goals_status ON sprint_goals(status);
CREATE INDEX IF NOT EXISTS idx_sprint_progress_sprint_id ON sprint_progress(sprint_id);
CREATE INDEX IF NOT EXISTS idx_project_health_scores_project_date ON project_health_scores(project_id, score_date);
CREATE INDEX IF NOT EXISTS idx_burndown_data_project_date ON burndown_data(project_id, date);
CREATE INDEX IF NOT EXISTS idx_critical_path_tasks_project_date ON critical_path_tasks(project_id, analysis_date);
CREATE INDEX IF NOT EXISTS idx_critical_path_tasks_task ON critical_path_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_task ON help_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_requester ON help_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
CREATE INDEX IF NOT EXISTS idx_help_request_suggestions_request ON help_request_suggestions(help_request_id);
CREATE INDEX IF NOT EXISTS idx_help_request_suggestions_user ON help_request_suggestions(suggested_user_id);
CREATE INDEX IF NOT EXISTS idx_team_member_sprint_perf_sprint ON team_member_sprint_performance(sprint_id);
CREATE INDEX IF NOT EXISTS idx_team_member_sprint_perf_user ON team_member_sprint_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_skill_growth_user_date ON skill_growth_history(user_id, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_skill_growth_skill ON skill_growth_history(user_id, skill_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_date ON performance_metrics(user_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_user_date ON member_contributions(user_id, contribution_date DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_type ON member_contributions(contribution_type);
CREATE INDEX IF NOT EXISTS idx_growth_goals_user_status ON growth_goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_task_id ON activity_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_timestamp ON activity_logs(user_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_hourly_activity_summary_user ON hourly_activity_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_hourly_activity_summary_hour_start ON hourly_activity_summary(hour_start);
CREATE INDEX IF NOT EXISTS idx_hourly_activity_summary_user_hour ON hourly_activity_summary(user_id, hour_start);
CREATE INDEX IF NOT EXISTS idx_hourly_activity_summary_ai_status ON hourly_activity_summary(ai_analysis_status);
CREATE INDEX IF NOT EXISTS idx_project_snapshots_project_id ON project_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_project_snapshots_created_at ON project_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_hash ON dashboard_alerts(alert_hash);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON dashboard_alerts(status);

-- system settings
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type TEXT CHECK(setting_type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
    description TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- holidays
CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holiday_date TEXT NOT NULL UNIQUE,
    holiday_name TEXT NOT NULL,
    holiday_type TEXT CHECK(holiday_type IN ('national', 'company', 'other')) DEFAULT 'national',
    is_recurring INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- indexes for new tables
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_type ON holidays(holiday_type);

-- ============================================================
-- 見積もり機能関連テーブル
-- ============================================================

-- 見積もりマスタ
CREATE TABLE IF NOT EXISTS estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  pattern_type TEXT NOT NULL, -- 'duration_unknown', 'duration_fixed', 'task_based', etc.
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft', -- 'draft', 'in_progress', 'completed'
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- AI会話履歴
CREATE TABLE IF NOT EXISTS estimate_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  role TEXT NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  metadata TEXT, -- JSON: パターン固有のデータ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- 見積もり入力パラメータ
CREATE TABLE IF NOT EXISTS estimate_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  param_key TEXT NOT NULL, -- 'team_size', 'budget', 'duration', etc.
  param_value TEXT NOT NULL, -- JSON形式で柔軟に保存
  param_type TEXT, -- 'number', 'date', 'array', 'object'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- 見積もり結果
CREATE TABLE IF NOT EXISTS estimate_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  result_type TEXT NOT NULL, -- 'optimistic', 'standard', 'pessimistic'
  total_effort REAL, -- 総工数（人日）
  duration_days INTEGER, -- 期間（日数）
  team_size REAL, -- 平均人数
  total_cost REAL, -- 総コスト
  confidence_level REAL, -- 信頼度 (0-1)
  breakdown TEXT, -- JSON: 詳細内訳
  recommendations TEXT, -- JSON: AIの推奨事項
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- フェーズ別詳細（フェーズ別見積もり用）
CREATE TABLE IF NOT EXISTS estimate_phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  phase_name TEXT NOT NULL, -- '要件定義', '設計', '開発', etc.
  phase_order INTEGER NOT NULL,
  effort REAL, -- 工数（人日）
  duration_days INTEGER,
  team_size REAL,
  start_date DATE,
  end_date DATE,
  dependencies TEXT, -- JSON: 依存フェーズ
  -- AI効率化設定
  use_ai BOOLEAN DEFAULT 0, -- AIを利用するか
  ai_efficiency_ratio REAL DEFAULT 0, -- AI効率化比率 (0-1, 例: 0.3 = 30%削減)
  ai_efficiency_auto BOOLEAN DEFAULT 1, -- AI効率化比率を自動判断するか
  effort_with_ai REAL, -- AI利用時の工数
  duration_with_ai INTEGER, -- AI利用時の期間
  estimation_method TEXT, -- 見積もり手法
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- タスク別詳細（タスクベース見積もり用）
CREATE TABLE IF NOT EXISTS estimate_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  task_description TEXT,
  task_order INTEGER NOT NULL,
  phase_id INTEGER, -- 所属フェーズ（任意）
  effort REAL, -- 工数（人日）
  complexity TEXT, -- 'low', 'medium', 'high'
  -- AI効率化設定
  use_ai BOOLEAN DEFAULT 0,
  ai_efficiency_ratio REAL DEFAULT 0,
  ai_efficiency_auto BOOLEAN DEFAULT 1,
  effort_with_ai REAL,
  priority TEXT, -- 'must', 'should', 'nice'
  is_mvp_core BOOLEAN DEFAULT 0,
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES estimate_phases(id) ON DELETE SET NULL
);

-- スキル別人員配置（スキルレベル別見積もり用）
CREATE TABLE IF NOT EXISTS estimate_skill_allocation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  skill_level TEXT NOT NULL, -- 'senior', 'middle', 'junior'
  count REAL, -- 人数
  hourly_rate REAL, -- 単価
  effort REAL, -- 工数（人日）
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- リスク要因（リスク考慮型用）
CREATE TABLE IF NOT EXISTS estimate_risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  risk_category TEXT NOT NULL, -- 'technical', 'requirement', 'team', 'external'
  risk_description TEXT,
  impact_level TEXT, -- 'low', 'medium', 'high'
  buffer_percentage REAL, -- バッファ率
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- 過去プロジェクトデータ（類似プロジェクト見積もり用）
CREATE TABLE IF NOT EXISTS estimate_historical_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  project_description TEXT,
  technology_stack TEXT, -- JSON
  total_effort REAL,
  duration_days INTEGER,
  team_size INTEGER,
  actual_cost REAL,
  success_rating INTEGER,
  lessons_learned TEXT,
  completed_at DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 保守運用項目（保守用見積もり用）
CREATE TABLE IF NOT EXISTS estimate_maintenance_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id INTEGER NOT NULL,
  item_type TEXT, -- 'incident', 'maintenance', 'minor_change', 'inquiry'
  item_name TEXT NOT NULL,
  monthly_frequency REAL,
  hours_per_occurrence REAL,
  priority TEXT,
  use_ai BOOLEAN DEFAULT 0,
  ai_efficiency_ratio REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimate_conversations_estimate_id ON estimate_conversations(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_parameters_estimate_id ON estimate_parameters(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_results_estimate_id ON estimate_results(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_phases_estimate_id ON estimate_phases(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_tasks_estimate_id ON estimate_tasks(estimate_id);
