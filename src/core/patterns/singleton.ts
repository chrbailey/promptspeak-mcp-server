/**
 * ===============================================================================
 * SINGLETON PATTERN UTILITIES
 * ===============================================================================
 *
 * Reusable singleton pattern implementation to reduce boilerplate.
 * Used across: SwarmEventBus, HookRegistry, SwarmController, BootCampController, etc.
 *
 * Usage:
 *   const [getInstance, resetInstance] = createSingleton(() => new MyClass());
 *   export { getInstance as getMyClass, resetInstance as resetMyClass };
 *
 * ===============================================================================
 */

/**
 * Creates a singleton factory with lazy initialization.
 *
 * @param factory - Function that creates the singleton instance
 * @returns Tuple of [getInstance, resetInstance] functions
 *
 * @example
 * ```typescript
 * class DatabaseConnection {
 *   constructor(private config: Config) {}
 * }
 *
 * const [getDb, resetDb] = createSingleton(() => new DatabaseConnection(loadConfig()));
 * export { getDb as getDatabaseConnection };
 * ```
 */
export function createSingleton<T>(factory: () => T): [() => T, () => void] {
  let instance: T | null = null;

  const getInstance = (): T => {
    if (instance === null) {
      instance = factory();
    }
    return instance;
  };

  const resetInstance = (): void => {
    instance = null;
  };

  return [getInstance, resetInstance];
}

/**
 * Creates a singleton factory with async initialization.
 *
 * @param factory - Async function that creates the singleton instance
 * @returns Tuple of [getInstance, resetInstance] functions
 *
 * @example
 * ```typescript
 * const [getDb, resetDb] = createAsyncSingleton(async () => {
 *   const db = new Database();
 *   await db.connect();
 *   return db;
 * });
 * ```
 */
export function createAsyncSingleton<T>(
  factory: () => Promise<T>
): [() => Promise<T>, () => void] {
  let instance: T | null = null;
  let initPromise: Promise<T> | null = null;

  const getInstance = async (): Promise<T> => {
    if (instance !== null) {
      return instance;
    }
    if (initPromise !== null) {
      return initPromise;
    }
    initPromise = factory().then((result) => {
      instance = result;
      initPromise = null;
      return result;
    });
    return initPromise;
  };

  const resetInstance = (): void => {
    instance = null;
    initPromise = null;
  };

  return [getInstance, resetInstance];
}

/**
 * Creates a singleton with configurable initialization.
 * Allows passing configuration on first call.
 *
 * @param factory - Function that creates the instance with config
 * @returns Tuple of [getInstance, resetInstance] functions
 *
 * @example
 * ```typescript
 * const [getServer, resetServer] = createConfigurableSingleton(
 *   (config: ServerConfig) => new Server(config)
 * );
 *
 * // First call initializes with config
 * const server = getServer({ port: 3000 });
 *
 * // Subsequent calls return same instance (config ignored)
 * const sameServer = getServer({ port: 4000 }); // Returns 3000 server
 * ```
 */
export function createConfigurableSingleton<T, C>(
  factory: (config: C) => T
): [(config: C) => T, () => void] {
  let instance: T | null = null;

  const getInstance = (config: C): T => {
    if (instance === null) {
      instance = factory(config);
    }
    return instance;
  };

  const resetInstance = (): void => {
    instance = null;
  };

  return [getInstance, resetInstance];
}
