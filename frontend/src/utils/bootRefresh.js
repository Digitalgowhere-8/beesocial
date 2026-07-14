const FRESH_BOOT_CACHE_PREFIXES = [
  'dashboard_analytics_state_',
  'intel_desk_state_',
  'content_studio_cache:',
  'blog_library_cache:'
];

export function clearPageDataCachesOnBoot() {
  try {
    const keys = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && FRESH_BOOT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // If storage is unavailable, pages will still fetch from the API normally.
  }
}
