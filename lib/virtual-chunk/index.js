'use strict';

const fs = require('fs');
const VirtualChunkError = require('./error');
const defaultStatsParams = require('./stats_params.json');


class VirtualChunk {
    constructor(context, filename, inputFileSystem) {
        this.context = context;
        this.ifs = inputFileSystem;
        this.filename = filename;
        this.exists = false;

        this.populateFileSystem();
    }


    populateFileSystem() {
        try {
            const stats = this.ifs.statSync(this.filename);
            throw new VirtualChunkError(`file '${this.filename}' already exists`, stats);
        } catch(err) {
            if (err.code !== 'ENOENT') throw err;
            this.exists = true;
            this.setContent('');
        }
    }


    remove() {
        this.exists = false;
        this.ifs._statStorage.data.delete(this.filename);
        return this.ifs._readFileStorage.data.delete(this.filename);
    }


    getContent(format) {
        const data = this.ifs._readFileStorage.data.get(this.filename);

        if (!this.exists || !data) {
            throw new Error(`File ${this.filename} doesn't exist`);
        }

        return format === undefined ? data[1] : data[1].toString(format);
    }


    getStats() {
        return this.ifs._statStorage.data.get(this.filename);
    }


    setContent(content) {
        if (!this.exists) throw new Error(`File ${this.filename} doesn't exist`);

        const sp = this._getStatsParams(content.length);
        const stats = this._stats = this._createStats(sp);

        this.ifs._statStorage.data.set(this.filename, [null, stats]);
        this.ifs._readFileStorage.data.set(this.filename, [null, content]);
    }


    match(content) {
        if (typeof content !== 'string') {
            content = content.toString('utf8');
        }

        return content === this.getContent('utf8');
    }


    _getStatsParams(size) {
        if (!VirtualChunk.statsParams.dev) {
            const stats = fs.statSync(this.context);       // TODO: add try-catch
            Object.assign(VirtualChunk.statsParams, {
                dev: stats.dev,
                uid: stats.uid,
                gid: stats.gid,
                rdev: stats.rdev,
                blksize: stats.blksize,
            });
        }

        const time = Date.now();
        const sp = Object.assign({}, VirtualChunk.statsParams);

        sp.size = size;
        sp.atimeMs = time;
        sp.mtimeMs = time;
        sp.ctimeMs = time;
        sp.birthtimeMs = time;

        return sp;
    }


    _createStats(sp) {
        const stats = new fs.Stats(
            sp.dev, sp.mode, sp.nlink, sp.uid, sp.gid, sp.rdev, sp.blksize, sp.ino,
            sp.size, sp.blocks, sp.atimeMs, sp.mtimeMs, sp.ctimeMs, sp.birthtimeMs
        );
        stats.virtual = true;

        return stats;
    }
}

VirtualChunk.statsParams = Object.assign({}, defaultStatsParams);

module.exports = VirtualChunk;