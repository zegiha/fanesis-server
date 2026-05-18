-- RenameIndex
ALTER INDEX "calendar_integrations_user_provider_account_key" RENAME TO "calendar_integrations_user_uuid_provider_provider_account_i_key";

-- RenameIndex
ALTER INDEX "calendar_synced_calendars_integration_external_key" RENAME TO "calendar_synced_calendars_integration_uuid_external_calenda_key";

-- RenameIndex
ALTER INDEX "task_external_links_calendar_event_key" RENAME TO "task_external_links_synced_calendar_uuid_external_event_id_key";
