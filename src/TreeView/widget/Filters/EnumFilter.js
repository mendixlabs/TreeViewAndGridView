define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dijit/CheckedMenuItem",
    "TreeView/widget/Commons",
    "TreeView/widget/Filters/ExclusiveFilter"
], function(declare, lang, CheckedMenuItem, Commons, ExclusiveFilter) {
    "use strict";

    return declare("TreeView.widget.Filters.EnumFilter", ExclusiveFilter, {

        constructor: function (args, filterManager) {

            this.enumStateMap = {};

            this.anyitem = new CheckedMenuItem({
                label: this.anylabel,
                checked: true,
                onClick: lang.hitch(this, this.itemClick, this.anylabel)
            });
            this.menuItems.push(this.anyitem);

            this.menuItems = this.menuItems.concat( dojo.map(
                Commons.getEnumMap(filterManager.widget.entity, this.filterattr),
                function (enumItem) {

                    var mi = new CheckedMenuItem({
                        label: enumItem.caption,
                        checked: false,
                        onClick: lang.hitch(this, this.itemClick, enumItem.caption)
                    });

                    this.enumStateMap[enumItem.key] = mi;
                    return mi;
                }, this));

            dojo.forEach(this.menuItems, function(item) {
                this.menu.addChild(item);
            }, this);

        },

        getSearchConstraints: function () {
            var res = [];

            for (var key in this.enumStateMap){
                if (this.enumStateMap[key].get("checked") === true){
                    res.push(this.filterattr + " = '" + key + "'");
                }
            }

            return res;
        }
    });
});
