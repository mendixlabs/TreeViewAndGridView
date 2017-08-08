define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/dom-attr",
], function(declare, lang, attr) {
    "use strict"

    return declare("TreeView.widget.Commons.Checkbox", null, {
        onChange: null,
        value: null,
        className: null,
        readOnly: false,

        _clickSubscription: null,

        constructor: function (args, domNode) {
            dojo.mixin(this, args);

            this.checkbox = mxui.dom.create("input", {
                type: "checkbox"
            });

            attr.set(this.checkbox, "checked", this.value);
            attr.set(this.checkbox, "readonly", this.readOnly);
            attr.set(this.checkbox, "disabled", this.readOnly);

            if (!this.readOnly){
                this._clickSubscription = dojo.connect(this.checkbox, "onchange", lang.hitch(this, this.change));
            }

            dojo.addClass(this.checkbox, "gv_checkbox " + this.className);

            dojo.place(this.checkbox, domNode);
        },

        change: function (e) {
            this.onChange.call(null, this.checkbox.checked);
            if (e) {
                e.stopPropagation();
            }
        },

        /* dojo get & set proxying */
        set: function () {
            return undefined;
        },

        get: function () {
            return undefined;
        },

        destroy: function () {
            if (this._clickSubscription)
                dojo.disconnect(this._clickSubscription);
        }
    });
});
