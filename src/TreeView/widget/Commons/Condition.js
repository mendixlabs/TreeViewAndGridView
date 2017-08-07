define([
    "dojo/_base/declare",
    "TreeView/widget/Commons"
], function(declare, Commons) {
    "use strict";

    return declare("TreeView.widget.Commons.Condition", null, {
        condname: "",
        condattr: "",
        condvalues: "",
        condclass: "",

        widget: null,
        values: null,

        constructor: function (args, widget) {
            dojo.mixin(this, args);
            this.widget = widget;

            //always compare strings
            this.values = dojo.map(("" + this.condvalues).split("\\n"), function (s) {
                return dojo.trim(s);
            });
        },

        getClass: function () {
            return this.condclass;
        },

        appliesTo: function (record) {
            logger.debug("Condition.appliesTo");
            var value = Commons.getObjectAttr(record.data(), this.condattr);
            if (value === null || value === undefined || /^\s*$/.test("" + value)) {
                if (dojo.indexOf(this.values, "false") != -1){ //This one was suppossed to match on falsy values
                    return true;
                } else {
                    return false;
                }
            }
            return -1 != dojo.indexOf(this.values, "" + value);
        },

        appliesToAsync: function (record, cb) {
            logger.debug("Condition.appliesToAsync");
            Commons.getObjectAttrAsync(record.data(), this.condattr, false, dojo.hitch(this, function(value) {
                if (value === null || value === undefined || /^\s*$/.test("" + value)) {
                    if (dojo.indexOf(this.values, "false") != -1){ //This one was suppossed to match on falsy values
                        return cb(true);
                    } else {
                        return cb(false);
                    }
                }
                cb(-1 != dojo.indexOf(this.values, "" + value));
            }));
        }
    });
});
