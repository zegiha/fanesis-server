-- folder 삭제 시 task를 inbox로 reset하던 trigger를 제거한다.
-- 이 책임은 이제 FolderService.remove()의 prisma.$transaction이 담당한다.
-- backlog_folder_consistency CHECK은 그대로 유지되므로, 누군가 folder를 raw로 삭제하려 해도
-- ON DELETE SET NULL → backlog_kind='folder' & backlog_folder_id=null → CHECK violation으로 막힌다.

DROP TRIGGER IF EXISTS trg_folder_delete_reset_tasks ON folders;
DROP FUNCTION IF EXISTS reset_task_to_inbox_on_folder_delete();
