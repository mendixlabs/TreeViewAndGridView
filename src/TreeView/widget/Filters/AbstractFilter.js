define([
    "dojo/_base/declare",
    "dojo/_base/lang"
], function(declare, lang) {
    "use strict";

    return declare("TreeView.widget.Filters.AbstractFilter", null, {
        filterManager: null,

        filterattr: null,
        filtertruecaption: null,
        filterfalsecaption: null,
        filterbooleandefault: null,

        isEnum: false,
        trueitem: null,
        falseitem: null,
        enumStateMap: null,
        enumItems: null,

        itemClick: function () {
            this.filterManager.applyFilters();
        },

        constructor: function (args, filterManager) {
            this.filterManager = filterManager;
            dojo.mixin(this, args);

        },
        
        getSearchConstraints: function () {
            console.error("ERROR: You must override getSearchConstraints()");
        },
        
        free: function () {}
    });
});
