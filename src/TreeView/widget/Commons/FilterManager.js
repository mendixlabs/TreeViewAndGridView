define([
    "dojo/_base/declare",
    "dijit/form/DropDownButton",
    "dijit/Menu",
    "dijit/MenuSeparator"
], function(declare, DropDownButton, Menu, MenuSeparator) {
    "use strict";

    return declare("TreeView.widget.Commons.FilterManager", null, {
        widget: null,
        domNode : null,
        filters : null,

        constructor : function(widget) {
            this.widget   = widget;
            this.filters  = [];

            this.menu = new Menu({
                style: "display: none;"
            });

            this.dropdown = new DropDownButton({
                label : "Filter",
                dropDown : this.menu
            });

            dojo.addClass(this.dropdown.dropDown.domNode, "gv_filter_dropdown_menu");

            this.domNode = this.dropdown.domNode;
            dojo.addClass(this.domNode, "gv_filter_dropdown");
        },

        getSearchConstraints : function() {
            var cs = dojo.map(this.filters, function(filter) {
                return filter.getSearchConstraints().join(" or ");
            }).join(" ][ ");
            return cs.length > 0 ? "[" + cs + "]" : "";
        },

        addFilter : function(filter) {
            if (this.filters.length > 0) {
                this.menu.addChild(new MenuSeparator());
            }

            this.filters.push(filter);
            dojo.forEach(filter.getMenuItems(), function(item) {
                this.menu.addChild(item);
            }, this);
        },

        free : function() {
            dojo.forEach(this.filters, function(filter) {
                filter.free();
            });

            this.dropdown.destroy();
        },

        applyFilters : function() {
            this.widget.curpage = 0;
            this.widget.fetchAll();
        }
    });
});
