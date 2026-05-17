-- 같은 유저의 같은 날짜(scheduled_date)에 active_kind='big3'인 태스크는 최대 3개까지만 허용한다.
-- 행 수 제약은 CHECK constraint로 표현 불가하므로 BEFORE INSERT/UPDATE trigger로 처리.

CREATE OR REPLACE FUNCTION enforce_big3_daily_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF NEW.active_kind = 'big3' AND NEW.scheduled_date IS NOT NULL THEN
    SELECT COUNT(*) INTO current_count
      FROM tasks
     WHERE user_uuid = NEW.user_uuid
       AND active_kind = 'big3'
       AND scheduled_date = NEW.scheduled_date
       AND uuid <> NEW.uuid;
    IF current_count >= 3 THEN
      RAISE EXCEPTION 'big3 limit exceeded for user % on %', NEW.user_uuid, NEW.scheduled_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_big3_daily_limit
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION enforce_big3_daily_limit();
