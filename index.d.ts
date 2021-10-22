declare namespace AsyncLock {
    export type AsyncLockCallback = (token: AsyncLockToken) => void;
    export type ResetEventCallback = (token: ResetEventLockToken) => void;
    export type SyncWrapperCallback = (leave: () => void) => void;
    export type AsyncWrapperCallback<T, A extends unknown[]> = (...args: A) => Promise<T>;

    /**
     * The strategy that will be used when a callback causes the pending queue
     * to exceed the maxQueueSize. The value symbolizes the item that is going
     * to be removed from the queue to accommodate for the new callback.
     * - `this` - The current (the callback that caused the queue to exceed
     * maxQueueSize) callback is going to be removed from the queue.
     * - `first` - The first (oldest) callback is going to be removed and the
     * current callback will be added at the end.
     * - `last` - The last callback is going to be removed and the current
     * callback will take its place.
     */
    export type OverflowStrategy = "this" | "first" | "last";

    /**
     * Base options for configuring the {@link AsyncLock} and {@link ResetEvent}.
     */
    export interface OptionsBase {
        /**
         * The maximum number of queued pending callbacks. Note that the executing
         * callback is not considered pending.
         * @default Infinity
         */
        maxQueueSize: number;
        /**
         * The strategy that will be used when a callback causes the pending queue
         * to exceed the maxQueueSize. The value symbolizes the item that is going
         * to be removed from the queue to accommodate for the new callback. See
         * {@link OverflowStrategy} for more details on the allowed values.
         *
         * Assuming the queue contains the callbacks `[A,B,C]` the callback `D` is
         * the current callback and `maxQueueSize` is `3`, the resulting queue is,
         * depending on this setting:
         *
         * - `this` - [A,B,C]
         * - `first` - [B,C,D]
         * - `last` - [A,B,D]
         *
         * @default "this"
         */
        overflowStrategy: OverflowStrategy;
    }

    /**
     * Options for configuring the {@link ResetEvent}.
     */
    export interface ResetEventOptions extends OptionsBase {
        /**
         * The number of callbacks to call before the event is auto reset
         * (becomes non-signaled).
         */
        autoResetCount: number;
    }

    /**
     * Options for configuring the {@link AsyncLock}.
     */
    export interface AsyncLockOptions extends OptionsBase {
    }

    /**
     * Base interface for locks acquired by the {@link AsyncLock} and {@link ResetEvent}.
     */
    export interface LockTokenBase {
        /** A unique id for each token, must be comparable using `===` operator. */
        id: unknown;
        /** A boolean representing the cancellation state of the token. */
        isCanceled: boolean;
        /** The callback to be called when the token is ready to execute. */
        callback: AsyncLockCallback;
        /**
         * A function which returns the elapsed time between the creation of the
         * token and now.
         */
        elapsed?: (this: AsyncLockToken) => number;
        /** The start time of when this token was created. */
        start?: Date;
    }

    /**
     * Represents a lock acquired by the {@link ResetEvent}.
     */
    export interface ResetEventLockToken extends LockTokenBase {
        /** A reference to the reset event that created this token. */
        resetEvent?: ResetEvent;
    }

    /**
     * Represents a lock acquired by the {@link AsyncLock}.
     */
    export interface AsyncLockToken extends LockTokenBase {
        /** A reference to the lock that created this token. */
        lock?: AsyncLock;
        /** A convenience function to leave the lock using this token. */
        leave?: (this: AsyncLockToken) => void;
    }

    /**
     * The main API of the AsyncLock object created by the AsyncLock constructor.
     */
    export class AsyncLock {
        /** Default options used when creating a new lock instance. */
        static defaultOptions: AsyncLockOptions;

        /**
         * Creates a new AsyncLockInstance using the given options. If no options
         * are provided the default options are used.
         *
         * Override any default option to make all future lock instance to be
         * created with the new defaults. Locks within the Wrapper are created with
         * these options as well.
         */
        constructor(options?: Partial<AsyncLockOptions>);

        /**
         * Tries to acquire the lock and when successful executes the callback. If
         * the lock cannot be acquired waits (asynchronously) until the lock is
         * freed.
         *
         * The callback function will receive the token returned by the enter
         * function.
         *
         * If timeout is provided will wait only the given amount of milliseconds
         * and then cancel the callback setting the isCanceled property to true on
         * the token. If timeout is not provided, it will wait indefinitely.
         * @param callback The callback which is going to be called when the lock
         * is acquired.
         * @param timeout The amount of time to wait in milliseconds before
         * canceling the callback call. The callback is of the form foo(token) (i.e.
         * it will receive the acquired token as a parameter when called).
         * @returns The token which controls the lock for this callback.
         */
        enter(callback: AsyncLockCallback, timeout?: number): void;

        /**
         * Leaves the lock and allows the execution of the next called to enter. The
         * token must be the token that acquired the lock otherwise an exception is
         * thrown.
         *
         * The callback of the next caller to enter will be triggered based on the
         * `executeCallback` function (default is asynchronous).
         *
         * If `abortPending` is `true` then all the pending callbacks are canceled
         * and will not be called. For each canceled callback token, `isCanceled` is
         * set to `true`.
         * @param token The token which has acquired the lock.
         * @param abortPending If true, all pending callbacks are canceled and never
         * executed. This token is used only to make sure that only the appropriate
         * owner releases the lock.
         */
        leave(token: AsyncLockToken, abortPending?: boolean): void;

        /**
         * @returns `true` if the lock is currently acquired and false otherwise.
         */
        isLocked(): boolean;

        /**
         * @returns The number of callbacks currently pending on the lock. Note
         * that inside a callback that callback is no longer pending.
         */
        queueSize(): number;

        /**
         * A function that creates all the tokens that are used by this lock
         * instance (a token per enter call). The token has the following fields:
         * @param callback The callback associated with the acquiring of this token.
         * @returns The newly created token wit the callback.
         */
        createToken(callback: AsyncLockCallback): AsyncLockToken;

        /**
         * A function which is used to execute the callback on the token. The
         * default implementation will execute the callback asynchronously after
         * successful acquiring of the lock.
         * @param token The token which contains the callback to call.
         */
        executeCallback(token: AsyncLockToken): void;

        /**
         * A function which is used to reduce the lock queue size when a call to
         * enter is made and the queue has a limited size. If the options are
         * changed pragmatically after an instance of the lock was created, it is up
         * to the user to call this function to adjust the queue size. Override this
         * function to create different queuing logic.
         * @param queue The queue of tokens.
         * @param options The options that control the reduction algorithm.
         * @returns An array of the tokens which were removed from the queue
         */
        reduceQueue(queue: AsyncLockToken[], options: AsyncLockOptions): AsyncLockToken[];
    }

    /**
     * The reset event is somewhat based on the C# AutoResetEvent and
     * ManualResetEvent classes. It is similar to a promise only it can be used
     * multiple times.
     *
     * When a function begins an activity that must complete before other
     * functions proceed, it calls reset to put the ResetEvent in the non-signaled state.
     *
     * Functions that call wait on the reset event will not execute immediately,
     * awaiting the signal. When the running function completes the activity, it
     * calls set to signal that the waiting functions can proceed.
     *
     * All waiting functions are executed until the event becomes non-signaled.
     * Once it has been signaled, a reset event remains signaled until it is
     * manually reset using the reset function. That is, calls to wait execute
     * immediately.
     */
    export class ResetEvent {
        /** Default options used when creating a new reset event instance. */
        static defaultOptions: ResetEventOptions;

        /**
         * Creates a new `ResetEventInstance` using the given signaled state and
         * options. If no options are provided the default options are used.
         * @param isSignaled
         * @param options
         */
        constructor(isSignaled?: boolean, options?: Partial<ResetEventOptions>);

        /**
         * A function that creates the token which will be used in this reset event.
         * @param callback Callback to wrap in a token.
         * @returns The newly created token.
         */
        createToken(callback: ResetEventCallback): ResetEventLockToken;

        /**
         * A function which is used to execute the callback on the token. The
         * default implementation will execute the callback synchronously.
         * @param token A token with a callback to execute.
         */
        executeCallback(token: ResetEventLockToken): void;

        /**
         * A function which is used to reduce the reset event queue size when a call
         * to wait is made. If the options are changed pragmatically after an
         * instance was created, it is up to the user to call this function to
         * adjust the queue size. Override this function to create different queuing
         * logic.
         * @param queue The queue of tokens.
         * @param options The options that control the reduction algorithm.
         * @returns An array of the tokens which were removed from the queue
         */
        reduceQueue(queue: ResetEventLockToken[], options: ResetEventOptions): ResetEventLockToken[];

        /**
         * Marks the reset event as not signaled. All further calls to wait will
         * not execute immediately.
         */
        reset(): void;

        /**
         * Marks the reset event as signaled and executes all pending callbacks. All
         * further calls to wait will execute immediately. If `autoResetCount` count
         * option was passed, it will execute only the given number of callbacks
         * (excluding canceled callbacks) and then mark the event as non-signaled.
         */
        set(): void;

        /**
         * Waits until the reset event becomes signaled then executes the callback
         * function.
         *
         * If the reset event is already signaled when wait is called, the callback
         * is executed immediately.
         *
         * The callback function will receive the token returned by the wait
         * function.
         *
         * If timeout is provided will wait only the given amount of milliseconds
         * and then cancel the call. If timeout is not provided will wait
         * indefinitely. Returns a token which can be used to track the elapsed
         * time.
         * @param callback Callback to execute once the event becomes signaled.
         * @param timeout Number of milliseconds to wait until giving up.
         */
        wait(callback: ResetEventCallback, timeout?: number): void;

        /**
         * @returns `true` if the reset event is currently signaled and `false`
         * otherwise.
         */
        isSignaled(): boolean;

        /**
         * @returns The number of callbacks currently pending on the reset event.
         * Note than inside a callback that callback is not considered pending.
         */
        queueSize(): number;
    }

    /**
     * Tries to acquire the lock with the name `lockName` and when successful
     * executes the callback. If the lock cannot be acquired, waits
     * (asynchronously) until the lock is freed.
     *
     * The callback function will receive a leave function that must be called
     * to free the lock.
     *
     * If timeout is provided will wait only the given amount of milliseconds
     * and then cancel the call. If timeout is not provided will wait
     * indefinitely.
     *
     * @param lockName Name of the lock to acquire.
     * @param callback Code to execute within the lock.
     * @param timeout Number of milliseconds to wait to acquire the lock until
     * giving up.
     *
     */
    export function lock(lockName: string, callback: SyncWrapperCallback, timeout?: number): void;

    /**
     * Tries to acquire the lock with the name lockName and when successful
     * executes the callback. If the lock cannot be acquired waits
     * (asynchronously) until the lock is freed.
     *
     * The lock is automatically frees when the promise returned by callback is
     * either resolved or rejected. The rest of the arguments are passed
     * directly to the callback function.
     *
     * @remark
     *
     * Note that the wrapper uses ES6 Promises by default and falls back to
     * BlueBird promises if ES6 Promises are not supported by your node version.
     * The Promise used by the wrapper is defined as wrapper. Promise and can be
     * replaced by the user to any A+ promise library.
     *
     * @param lockName Name of the lock to acquire.
     * @param callback Code to execute within the lock.
     * @param args Additional arguments that are passed to the callback.
     * @returns The value that was returned by the callback.
     */
    export function lockPromise<T, A extends unknown[]>(
        lockName: string, callback: AsyncWrapperCallback<T, A>, ...args: A
    ): Promise<T>;

    /**
     * @param lockName Name of a lock to check.
     * @returns `true` if the lock with the name `lockName` is currently
     * acquired and `false` otherwise.
     */
    export function isLocked(lockName: string): boolean;

    /**
     * @param lockName Name of a lock to check.
     * @returns `true` if the lock with the name `lockName` already exists in
     * the service and `false` otherwise.
     */
    export function lockExists(lockName: string): boolean;

    /**
     * @param lockName Name of a lock to check.
     * @returns The number of callbacks currently pending on the lock with the
     * given name. Note than inside a callback that callback is no longer pending.
     */
    export function queueSize(lockName: string): number;

    /**
     * @param lockName Name of a lock to check.
     * @returns A copy of the options of the lock with the given name, if the
     * lock does not exist returns `null`.
     */
    export function getOptions(lockName: string): AsyncLockOptions | null;

    /**
     * Extends the options of a lock with the given name with the given
     * options. If a lock with the given name doesn't exist, creates the lock
     * and extends the default options with the given options. This function may
     * be used to create a lock without entering it by calling
     * `wrapper.setOptions('foo')`.
     * @param lockName  Name of a lock whose options to change.
     * @param options New options to set.
     */
    export function setOptions(lockName: string, options: Partial<AsyncLockOptions>): void;
}

export = AsyncLock;
