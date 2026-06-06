export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    const wait = last + ms - Date.now()
    clearTimeout(timer)
    if (wait <= 0) {
      last = Date.now()
      fn(...args)
    } else {
      timer = setTimeout(() => {
        last = Date.now()
        fn(...args)
      }, wait).unref()
    }
  }
}
