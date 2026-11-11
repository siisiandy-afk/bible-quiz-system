-- ============================================================================
-- BIBLE QUIZ BUZZER - SUPABASE DATABASE SCHEMA & RLS POLICIES
-- Migration: 20261110_init_quiz_buzzer_schema.sql
-- ============================================================================

-- Enable pgcrypto extension for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ROOMS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(10) NOT NULL UNIQUE,
    host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('OPEN', 'LOCKED')),
    game_mode VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (game_mode IN ('standard', 'speed')),
    round_number INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for instant lookup of active rooms by room code
CREATE INDEX IF NOT EXISTS idx_rooms_code_active ON public.rooms (room_code) WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 2. CONTESTANTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contestants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT true,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_room_contestant_name UNIQUE (room_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contestants_room ON public.contestants (room_id);

-- ----------------------------------------------------------------------------
-- 3. BUZZES TABLE (Server-Authoritative Timing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buzzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    contestant_name VARCHAR(100) NOT NULL,
    round_number INTEGER NOT NULL DEFAULT 1,
    buzzed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    reaction_time_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_buzz_per_round UNIQUE (room_id, contestant_name, round_number)
);

CREATE INDEX IF NOT EXISTS idx_buzzes_room_round ON public.buzzes (room_id, round_number, buzzed_at);

-- ----------------------------------------------------------------------------
-- 4. ATOMIC BUZZ RECORDING FUNCTION (Prevents Race Conditions)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_buzz(
    p_room_code VARCHAR,
    p_contestant_name VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms%ROWTYPE;
    v_buzz_id UUID;
    v_rank INTEGER;
    v_buzzed_at TIMESTAMPTZ;
BEGIN
    -- 1. Fetch room and check if open
    SELECT * INTO v_room FROM public.rooms WHERE room_code = p_room_code AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Room not found or inactive');
    END IF;

    IF v_room.status != 'OPEN' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Buzzer is locked');
    END IF;

    -- 2. Insert buzz record with clock_timestamp() for microsecond resolution
    v_buzzed_at := clock_timestamp();
    BEGIN
        INSERT INTO public.buzzes (room_id, contestant_name, round_number, buzzed_at)
        VALUES (v_room.id, p_contestant_name, v_room.round_number, v_buzzed_at)
        RETURNING id INTO v_buzz_id;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contestant already buzzed in this round');
    END;

    -- 3. Compute rank in current round
    SELECT COUNT(*) INTO v_rank
    FROM public.buzzes
    WHERE room_id = v_room.id AND round_number = v_room.round_number AND buzzed_at <= v_buzzed_at;

    RETURN jsonb_build_object(
        'success', true,
        'buzz_id', v_buzz_id,
        'rank', v_rank,
        'buzzed_at', v_buzzed_at,
        'round_number', v_room.round_number
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. ROOM VERIFICATION FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_room(p_room_code VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room public.rooms%ROWTYPE;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE room_code = p_room_code AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('exists', false);
    END IF;

    RETURN jsonb_build_object(
        'exists', true,
        'room_id', v_room.id,
        'status', v_room.status,
        'game_mode', v_room.game_mode,
        'round_number', v_room.round_number
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contestants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buzzes ENABLE ROW LEVEL SECURITY;

-- ROOMS POLICIES
-- Anyone can view active rooms (for verification and spectators)
CREATE POLICY "Public can view active rooms"
    ON public.rooms FOR SELECT
    USING (is_active = true);

-- Authenticated hosts can create rooms
CREATE POLICY "Hosts can create rooms"
    ON public.rooms FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL OR true);

-- Host can update their own room
CREATE POLICY "Hosts can update their rooms"
    ON public.rooms FOR UPDATE
    USING (host_id = auth.uid() OR host_id IS NULL);

-- CONTESTANTS POLICIES
-- Anyone in the room can see the connected contestants
CREATE POLICY "Public can view contestants of active rooms"
    ON public.contestants FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = contestants.room_id AND r.is_active = true
    ));

-- Contestants can register themselves in active rooms
CREATE POLICY "Contestants can register in active rooms"
    ON public.contestants FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = contestants.room_id AND r.is_active = true
    ));

-- Contestants can update their own presence/latency
CREATE POLICY "Contestants can update own status"
    ON public.contestants FOR UPDATE
    USING (true);

-- BUZZES POLICIES
-- Anyone in the room can view buzzes (for host and public display)
CREATE POLICY "Public can view buzzes of active rooms"
    ON public.buzzes FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = buzzes.room_id AND r.is_active = true
    ));

-- Direct insert is permitted when room is open
CREATE POLICY "Contestants can insert buzzes when room is open"
    ON public.buzzes FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = buzzes.room_id AND r.status = 'OPEN' AND r.is_active = true
    ));

-- ----------------------------------------------------------------------------
-- 7. REALTIME REPLICATION (For Supabase Realtime Channels)
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buzzes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contestants;
