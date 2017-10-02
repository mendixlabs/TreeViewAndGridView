define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dijit/CheckedMenuItem",
    "TreeView/widget/Commons",
    "TreeView/widget/Filters/AbstractFilter"
], function(declare, lang, CheckedMenuItem, Commons, AbstractFilter) {
    "use strict";

    return declare("TreeView.widget.Filters.Filter", AbstractFilter, {

        constructor: function (args, filterManager) {

            this.isEnum = Commons.getAttributeType(filterManager.widget.entity, this.filterattr) == "Enum";

            //setup enum menu items
            if (this.isEnum) {
                this.enumStateMap = {};

                this.enumItems = dojo.map(
                    Commons.getEnumMap(filterManager.widget.entity, this.filterattr),
                    function (enumItem) {

                        var mi = new CheckedMenuItem({
                            label: enumItem.caption,
                            checked: true,
                            onClick: lang.hitch(this, this.itemClick)
                        });

                        this.enumStateMap[enumItem.key] = mi;
                        return mi;
                    }, this);

            }

            //setup boolean menu items
            else {
                if (this.filtertruecaption){
                    this.trueitem = new CheckedMenuItem({
                        label: this.filtertruecaption,
                        checked: "all" == this.filterbooleandefault || true == this.filterbooleandefault,
                        onClick: lang.hitch(this, this.itemClick)
                    });
                }
                if (this.filterfalsecaption){
                    this.falseitem = new CheckedMenuItem({
                        label: this.filterfalsecaption,
                        checked: "all" == this.filterbooleandefault || false == this.filterbooleandefault,
                        onClick: lang.hitch(this, this.itemClick)
                    });
                }
            }

        },
        
        getMenuItems: function () {
            if (this.isEnum){
                return this.enumItems;
            }

            var res = [];
            if (this.trueitem){
                res.push(this.trueitem);
            }
            if (this.falseitem){
                res.push(this.falseitem);
            }
            return res;
        },

        getSearchConstraints: function () {
            var res = [];

            //enum?
            if (this.isEnum) {
                for (var key in this.enumStateMap){
                    if (this.enumStateMap[key].get("checked") === true){
                        res.push(this.filterattr + " = '" + key + "'");
                    }
                }
            } else { // Boolean?
                if (this.trueitem && this.trueitem.get("checked") === true){
                    res.push(this.filterattr + " =  true() ");
                }
                if (this.falseitem && this.falseitem.get("checked") === true){
                    res.push(this.filterattr + " =  false()");
                }

                //only one value is defined to filter? Then the other is always true
                if (this.falseitem ^ this.trueitem){
                    res.push(this.filterattr + " = " + (this.falseitem ? "true()" : "false()"));
                }
            }

            if (res.length == 0) {//filter all out
                res.push(this.isEnum ? this.filterattr + " = NULL" : this.filterattr + " = true() and " + this.filterattr + " = false()");
            }
            return res;
        }
    });
});
