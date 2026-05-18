export const CALENDAR_LINK_QUEUE = 'calendar-link';

export const CalendarLinkJob = {
  IncrementalSync: 'incremental-sync',
  PatchEvent: 'patch-event',
  ChannelRenewal: 'channel-renewal',
} as const;

export type IncrementalSyncJobData = {
  syncedCalendarUuid: string;
  /** true → ignore stored syncToken and do a full re-list */
  fullResync?: boolean;
};

export type PatchEventJobData = {
  taskUuid: string;
};

export type ChannelRenewalJobData = Record<string, never>;
