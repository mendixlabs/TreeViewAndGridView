define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dijit/CheckedMenuItem",
    "TreeView/widget/Commons",
    "TreeView/widget/Filters/ExclusiveFilter"
], function(declare, lang, CheckedMenuItem, Commons, ExclusiveFilter) {
    "use strict";

    return declare("TreeView.widget.Filters.BoolFilter", ExclusiveFilter, {

        constructor: function (args, fm) {
            this.anyitem = new CheckedMenuItem({
                label: this.anylabel,
                checked: true,
                onChange: lang.hitch(this, this.itemClick, this.anylabel)
            });
            this.menuItems.push(this.anyitem);

            if (this.filtertruecaption){
                this.trueitem = new CheckedMenuItem({
                    label: this.filtertruecaption,
                    checked: false,
                    onChange: lang.hitch(this, this.itemClick, this.filtertruecaption)
                });
                this.menuItems.push(this.trueitem);
            }
            if (this.filterfalsecaption){
                this.falseitem = new CheckedMenuItem({
                    label: this.filterfalsecaption,
                    checked: false,
                    onChange: lang.hitch(this, this.itemClick, this.filterfalsecaption)
                });
                this.menuItems.push(this.falseitem);
            }
            
            dojo.forEach(this.menuItems, function(item) {
                this.menu.addChild(item);
            }, this);
        },

        getSearchConstraints: function () {
            var res = [];

            if (this.trueitem && this.trueitem.get("checked") === true){
                res.push(this.filterattr + " =  true() ");
            }
            if (this.falseitem && this.falseitem.get("checked") === true){
                res.push(this.filterattr + " =  false()");
            }

            //only one value is defined to filter? Then the other is always true
            // if (this.falseitem ^ this.trueitem){
            //     res.push(this.filterattr + " = " + (this.falseitem ? "true()" : "false()"));
            // }

            if (res.length == 0) {//filter all out
                res.push(this.filterattr + " = true() or " + this.filterattr + " = false()");
            }
            return res;
        }
    });
});
