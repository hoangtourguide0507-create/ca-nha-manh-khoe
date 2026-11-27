import type { OcrWord } from '@up/domain/ocrLayout'

export type WorkerRequest = { type: 'INIT'; requestId: string; baseUrl: string } | { type: 'RECOGNIZE'; requestId: string; image: Blob }

export type WorkerResponse =
  | { type: 'READY'; requestId: string }
  | { type: 'PROGRESS'; requestId: string; percent: number }
  | { type: 'DOWNLOAD'; requestId: string; loaded: number; total: number }
  | { type: 'STAGE'; requestId: string; stage: string }
  | { type: 'RESULT'; requestId: string; lines: OcrWord[] }
  | { type: 'ERROR'; requestId: string; message: string }
