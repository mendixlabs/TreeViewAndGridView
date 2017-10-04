define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dijit/form/DropDownButton",
    "dijit/Menu",
    "dijit/CheckedMenuItem",
    "TreeView/widget/Commons",
    "TreeView/widget/Filters/AbstractFilter"
], function(declare, lang, DropDownButton, Menu, CheckedMenuItem, Commons, AbstractFilter) {
    "use strict";

    return declare("TreeView.widget.Filters.ExclusiveFilter", AbstractFilter, {
        
        itemClick: function (label, e) {
            this.dropdown.set("label", label);

            for (var i = 0; i < this.menuItems.length; i++) {
                var item = this.menuItems[i];
                
                item.set("checked", (item.label == label));
            }

            this.filterManager.applyFilters();
        },

        constructor: function (args, filterManager) {
            this.filterManager = filterManager;
            dojo.mixin(this, args);
            
            this.menu = new Menu({
                style: "display: none;"
            });
            this.menuItems = [];

            this.dropdown = new DropDownButton({
                label : this.filterattr,
                dropDown : this.menu
            });

            if (this.filteranycaption) {
                this.anylabel = this.filteranycaption;
            } else {
                this.anylabel = this.filterattr + ": -";
            }

            this.dropdown.set("label", this.anylabel);
            
            dojo.addClass(this.dropdown.dropDown.domNode, "gv_filter_dropdown_menu");
            dojo.addClass(this.dropdown.domNode, "gv_filter_dropdown");

            dojo.place(this.dropdown.domNode, this.filterManager.domNode);
        }
    });
});
