/**
 * 프로젝트 전역 에러 코드 카탈로그.
 * 새 에러를 추가할 때는 이 파일에 코드를 먼저 등록하고,
 * 도메인별 예외 파일에서 해당 코드를 참조해 클래스를 정의한다.
 */
export const ErrorCode = {
  // Auth
  AUTH_INVALID_GOOGLE_TOKEN: 'AUTH_INVALID_GOOGLE_TOKEN',
  AUTH_INVALID_TOKEN_TYPE: 'AUTH_INVALID_TOKEN_TYPE',
  AUTH_INVALID_REFRESH_TOKEN: 'AUTH_INVALID_REFRESH_TOKEN',

  // Task
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_INVALID_STATE: 'TASK_INVALID_STATE',
  TASK_BIG3_LIMIT_EXCEEDED: 'TASK_BIG3_LIMIT_EXCEEDED',
  FOLDER_NOT_FOUND: 'FOLDER_NOT_FOUND',
  FOLDER_NAME_DUPLICATED: 'FOLDER_NAME_DUPLICATED',

  // Common
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
