define([
    "dojo/_base/declare",
    "dijit/CheckedMenuItem",
    "TreeView/widget/Commons"
], function(declare, CheckedMenuItem, Commons) {
    "use strict"

    return declare("TreeView.widget.Commons.Filter", null, {
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

            this.isEnum = Commons.getAttributeType(fm.widget.entity, this.filterattr) == "Enum";

            //setup enum menu items
            if (this.isEnum) {
                this.enumStateMap = {};

                this.enumItems = dojo.map(
                    Commons.getEnumMap(fm.widget.entity, this.filterattr),
                    function (enumItem) {

                        var mi = new CheckedMenuItem({
                            label: enumItem.caption,
                            checked: true,
                            onClick: dojo.hitch(this, this.itemClick)
                        });

                        this.enumStateMap[enumItem.key] = mi;
                        return mi;
                    }, this);

            }

            //setup boolean menu items
            else {
                if (this.filtertruecaption)
                    this.trueitem = new CheckedMenuItem({
                        label: this.filtertruecaption,
                        checked: "all" == this.filterbooleandefault || true == this.filterbooleandefault,
                        onClick: dojo.hitch(this, this.itemClick)
                    });

                if (this.filterfalsecaption)
                    this.falseitem = new CheckedMenuItem({
                        label: this.filterfalsecaption,
                        checked: "all" == this.filterbooleandefault || false == this.filterbooleandefault,
                        onClick: dojo.hitch(this, this.itemClick)
                    });
            }

            this.fm.addFilter(this);
        },

        getMenuItems: function () {
            if (this.isEnum)
                return this.enumItems;

            else {
                var res = [];
                if (this.trueitem)
                    res.push(this.trueitem);
                if (this.falseitem)
                    res.push(this.falseitem);
                return res;
            }
        },

        getSearchConstraints: function () {
            var res = [];

            //enum?
            if (this.isEnum) {
                for (var key in this.enumStateMap)
                    if (this.enumStateMap[key].get("checked") === true)
                        res.push(this.filterattr + " = '" + key + "'");
            }

            //boolean?
            else {
                if (this.trueitem && this.trueitem.get("checked") === true)
                    res.push(this.filterattr + " =  true() ");
                if (this.falseitem && this.falseitem.get("checked") === true)
                    res.push(this.filterattr + " =  false()");

                //only one value is defined to filter? Then the other is always true
                if (this.falseitem ^ this.trueitem)
                    res.push(this.filterattr + " = " + (this.falseitem ? "true()" : "false()"));
            }

            if (res.length == 0) //filter all out
                res.push(this.isEnum ? this.filterattr + " = NULL" : this.filterattr + " = true() and " + this.filterattr + " = false()");

            return res;
        },

        free: function () {

        }
    });
});
