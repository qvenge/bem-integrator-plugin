class VirtualChunkError extends Error {
    constructor(message, stats) {
        super(message);
        this.stats = stats;
    }
}

module.exports = VirtualChunkError;