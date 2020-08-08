const ids = new Set();

function getUniqueId() {
    let id;

    do {
        id = Math.random().toString(36).substr(2, 9);
    } while(ids.has(id));

    ids.add(id);

    return id;
}

module.exports = getUniqueId;