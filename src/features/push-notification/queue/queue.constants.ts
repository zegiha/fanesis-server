export const PUSH_NOTIFICATION_QUEUE = 'push-notification';

export const PushNotificationJob = {
  SendApns: 'send-apns',
  CheckTaskReminders: 'check-task-reminders',
} as const;

export type SendApnsJobData =
  | {
      silent: false;
      deviceUuid: string;
      pushToken: string;
      bundleId: string;
      title: string;
      body: string;
      payload?: Record<string, unknown>;
    }
  | {
      silent: true;
      deviceUuid: string;
      pushToken: string;
      bundleId: string;
      payload?: Record<string, unknown>;
    };
