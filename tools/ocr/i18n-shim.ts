// Thay cho app/src/i18n của chia-tien: Sổ Nhà chỉ dùng tiếng Việt, không cần React.
export type Lang = 'vi' | 'en'
export const LOCALES: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US' }
export const getLang = (): Lang => 'vi'
export type TParams = Record<string, string | number | undefined>

export function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (whole, name: string, one?: string, other?: string) => {
    const value = params[name]
    if (value === undefined) return whole
    if (one !== undefined && other !== undefined) return Number(value) === 1 ? one : other
    return String(value)
  })
}

export const t = (source: string, params?: TParams): string => interpolate(source, params)
export const T = (source: string): string => source
