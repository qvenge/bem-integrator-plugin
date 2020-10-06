module.exports = {
    entityClasses: Object.create(null),

    getEntityInstance: function(domElem, entityName) {
        var bemInstances = domElem.bemInstances;
        if (!bemInstances) {
            bemInstances = domElem.bemInstances = Object.create(null);
        }
        var entityInstance = bemInstances[entityName];
        if (!entityInstance) {
            var params = window.BEM.getParams(domElem, entityName);
            entityInstance = bemInstances[entityName] = new window.BEM.entityClasses[entityName](domElem, params);
        }
        return entityInstance;
    },

    initAllEntities: function() {
        var entityNames = Object.keys(window.BEM.entityClasses);

        entityNames.forEach(function(name) {
            var elems = document.getElementsByClassName(name);

            for (var i = 0; i < elems.length; ++i) {
                window.BEM.getEntityInstance(elems[i], name);
            }
        });
    },

    getParams: function(elem, entityName) {
        if (elem.dataset.bem) {
            var bemParams = JSON.parse(elem.dataset.bem);
            return bemParams[entityName];
        }
    }
};