define([
    "dojo/_base/declare",
    "dojo/_base/lang"
], function(declare, lang) {
    "use strict";

    return declare("TreeView.widget.Filters.AbstractFilter", null, {
        fm: null,
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
            this.fm.applyFilters();
        },

        constructor: function (args, fm) {
            this.fm = fm;
            dojo.mixin(this, args);

        },
        
        getSearchConstraints: function () {
            console.error("ERROR: You must override getSearchConstraints()");

        },
        
        free: function () {

        }
    });
});
