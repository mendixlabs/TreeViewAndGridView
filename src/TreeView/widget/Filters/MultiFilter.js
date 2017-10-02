define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dijit/form/DropDownButton",
    "dijit/Menu",
    "dijit/MenuSeparator",
    "TreeView/widget/Filters/Filter"
], function(declare, lang, DropDownButton, Menu, MenuSeparator, Filter) {
    "use strict";

    return declare("TreeView.widget.Filters.MultiFilter", null, {
        filters : null,

        constructor: function (fm, data) {
            this.fm = fm;

            this.filters = dojo.map(data, function (d) {
                return new Filter(d, fm);
            }, this);

            this.menu = new Menu({
                style: "display: none;"
            });

            this.dropdown = new DropDownButton({
                label : "Filter",
                dropDown : this.menu
            });

            dojo.addClass(this.dropdown.dropDown.domNode, "gv_filter_dropdown_menu");

            this.fm.domNode = this.dropdown.domNode;
            dojo.addClass(this.fm.domNode, "gv_filter_dropdown");

            for (var i = 0; i < this.filters.length; i++) {
                var filter = this.filters[i];
                    
                if (i > 0) {
                    this.menu.addChild(new MenuSeparator());
                }

                dojo.forEach(filter.getMenuItems(), function(item) {
                    this.menu.addChild(item);
                }, this);
            }
            
        },
        
        getFilters: function () {
            return this.filters;
        },
        
        free: function () {
            dojo.forEach(this.filters, function(filter) {
                filter.free();
            });

            this.dropdown.destroy();
        }
    });
});
