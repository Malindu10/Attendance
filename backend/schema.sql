-- ============================================================
-- Academy Attendance System — PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Coaches (authenticated users)
-- ------------------------------------------------------------
CREATE TABLE coaches (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    pin_hash    TEXT NOT NULL,                  -- bcrypt hashed 6-digit PIN
    role        TEXT NOT NULL DEFAULT 'coach'   -- 'coach' | 'admin'
                CHECK (role IN ('coach','admin')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login  TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- Age groups
-- ------------------------------------------------------------
CREATE TABLE age_groups (
    id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name  TEXT UNIQUE NOT NULL   -- 'U9','U11','U13','U15','U17','U19'
);

INSERT INTO age_groups (name) VALUES
    ('U9'),('U11'),('U13'),('U15'),('U17'),('U19');

-- ------------------------------------------------------------
-- Locations
-- ------------------------------------------------------------
CREATE TABLE locations (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT UNIQUE NOT NULL,
    default_group UUID REFERENCES age_groups(id)
);

INSERT INTO locations (name) VALUES
    ('Pitch A'),('Pitch B'),('Indoor Hall'),('Training Ground');

-- ------------------------------------------------------------
-- Students
-- ------------------------------------------------------------
CREATE TABLE students (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    date_of_birth DATE,
    age_group_id  UUID NOT NULL REFERENCES age_groups(id),
    position      TEXT,
    jersey_number INT,
    is_regular    BOOLEAN NOT NULL DEFAULT TRUE,   -- regular vs occasional
    rekognition_face_id TEXT,                      -- AWS FaceId after IndexFaces
    photo_s3_key  TEXT,                            -- primary reference photo
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_age_group ON students(age_group_id);
CREATE INDEX idx_students_face_id   ON students(rekognition_face_id);
CREATE INDEX idx_students_active    ON students(is_active);

-- ------------------------------------------------------------
-- Sessions
-- ------------------------------------------------------------
CREATE TABLE sessions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id       UUID NOT NULL REFERENCES coaches(id),
    age_group_id   UUID NOT NULL REFERENCES age_groups(id),
    location_id    UUID NOT NULL REFERENCES locations(id),
    session_type   TEXT NOT NULL DEFAULT 'Training'
                   CHECK (session_type IN ('Training','Match','Fitness')),
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at       TIMESTAMPTZ,
    notes          TEXT,
    scan_count     INT NOT NULL DEFAULT 0,         -- total API calls this session
    is_closed      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_sessions_coach     ON sessions(coach_id);
CREATE INDEX idx_sessions_date      ON sessions(started_at);
CREATE INDEX idx_sessions_group     ON sessions(age_group_id);

-- ------------------------------------------------------------
-- Attendance records
-- ------------------------------------------------------------
CREATE TABLE attendance (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id   UUID NOT NULL REFERENCES sessions(id),
    student_id   UUID REFERENCES students(id),      -- NULL = unregistered guest
    marked_by    UUID NOT NULL REFERENCES coaches(id),
    method       TEXT NOT NULL DEFAULT 'face_scan'
                 CHECK (method IN ('face_scan','manual')),
    confidence   NUMERIC(5,2),                      -- Rekognition similarity %
    is_guest     BOOLEAN NOT NULL DEFAULT FALSE,
    guest_label  TEXT,                              -- 'Guest #1' etc
    marked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, student_id)                 -- prevent double-marking
);

CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date    ON attendance(marked_at);

-- ------------------------------------------------------------
-- Scan audit log — every attempt, success or fail
-- ------------------------------------------------------------
CREATE TABLE scan_log (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id    UUID NOT NULL REFERENCES sessions(id),
    coach_id      UUID NOT NULL REFERENCES coaches(id),
    ip_address    TEXT,
    result        TEXT NOT NULL
                  CHECK (result IN ('matched','no_match','error','rate_limited','blocked')),
    matched_student_id UUID REFERENCES students(id),
    confidence    NUMERIC(5,2),
    confirmed     BOOLEAN,                          -- coach tapped Confirm?
    scan_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scan_log_session  ON scan_log(session_id);
CREATE INDEX idx_scan_log_coach    ON scan_log(coach_id);
CREATE INDEX idx_scan_log_at       ON scan_log(scan_at);

-- ------------------------------------------------------------
-- Rate limit buckets (per coach, rolling windows)
-- ------------------------------------------------------------
CREATE TABLE rate_limit_buckets (
    coach_id      UUID NOT NULL REFERENCES coaches(id),
    window_key    TEXT NOT NULL,     -- 'minute:2024-05-14T10:32' etc
    scan_count    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (coach_id, window_key)
);

-- ------------------------------------------------------------
-- AWS Rekognition usage tracker (prevent overrun)
-- ------------------------------------------------------------
CREATE TABLE rekognition_usage (
    id          SERIAL PRIMARY KEY,
    month_key   TEXT NOT NULL UNIQUE,   -- 'YYYY-MM'
    api_calls   INT NOT NULL DEFAULT 0,
    hard_limit  INT NOT NULL DEFAULT 5000,
    soft_limit  INT NOT NULL DEFAULT 4000,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- initialise current month
INSERT INTO rekognition_usage (month_key) 
VALUES (TO_CHAR(NOW(), 'YYYY-MM'))
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Helper: auto-update updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_students_updated
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
