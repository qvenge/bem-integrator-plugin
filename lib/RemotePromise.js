class RemotePromise {
    constructor() {
        this._promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    then(...args) {
        return this._promise.then(...args);
    }
}

module.exports = RemotePromise;