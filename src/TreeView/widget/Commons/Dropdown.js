define([
    "dojo/_base/declare",
    "dijit/Menu",
    "dijit/MenuItem",
    "dijit/MenuSeparator",
    "dijit/form/DropDownButton"
], function(declare, Menu, MenuItem, MenuSeparator, DropDownButton) {
    "use strict"

    return declare("TreeView.widget.Commons.DropDown", null, {
        onChange: null,
        label: null,
        options: null,
        value: null,
        dataset: null,
        className: null,
        sticky: true,

        _datasetsub: null,

        constructor: function (args, domNode, owner) {
            dojo.mixin(this, args);
            this.options = this.options || [];

            if (this.dataset) {
                this._datasetsub = dojo.connect(this.dataset, "onReceiveItems", dojo.hitch(this, this.receiveDatasetItems));
                if (owner){
                    owner.addSubscription(this._datasetsub);
                }

            }

            this.menu = new Menu({
                style: "display: none;"
            });

            this.dropdown = new DropDownButton({
                label: this.label,
                dropDown: this.menu,
                onClick: function (e) {
                    dojo.stopEvent(e);
                }
            });
            this.domNode = this.dropdown.domNode;

            dojo.addClass(this.dropdown.dropDown.domNode, "gv_dropdown_menu " + this.className);
            dojo.addClass(this.dropdown.domNode, "gv_dropdown " + this.className);

            dojo.place(this.dropdown.domNode, domNode);

            this.addOptions(this.options);

            if (this.dataset)
                this.addOptions(this.dataset.getOptions());
        },

        receiveDatasetItems: function (items) {
            this.clearItems();
            this.addOptions(this.options);
            this.addOptions(items);
        },

        addOptions: function (items) {
            dojo.forEach(items, function (item) {
                this.menu.addChild(this.createOption(item));
            }, this);
        },

        clearItems: function () {
            dojo.forEach(this.menu.getChildren(), function (child) {
                this.menu.removeChild(child);
            }, this);
        },

        createOption: function (item) {
            //separator
            if (item == null){
                return new MenuSeparator();
            }

            if (this.sticky && this.value !== null && this.value == item.value){ //redraw selection if needed
                this.dropdown.set("label", item.label);
            }

            return new MenuItem({
                label: mxui.dom.escapeString(item.label),
                value: item.value,
                onClick: item.onClick
                    ? dojo.hitch(item, item.onClick, dojo.hitch(this, this.itemClick)) //pass itemClick as callback to the onClick, so it can be invoked
                    : dojo.hitch(this, this.itemClick, item)
            });
        },

        itemClick: function (item, e) {
            this.onChange.call(null, item.value);
            if (this.sticky) {
                this.dropdown.set("label", item.label);
                this.value = item.value;
            }

            if (e) {
                dojo.stopEvent(e);
            }
        },

        /* dojo get & set proxying */
        set: function () {
            return !this.dropdown._destroyed ? this.dropdown.set.apply(this.dropdown, arguments) : undefined;
        },

        get: function () {
            return !this.dropdown._destroyed ? this.dropdown.get.apply(this.dropdown, arguments) : undefined;
        },

        destroy: function () {
            if (this._datasetsub){
                dojo.disconnect(this._datasetsub);
            }
            this.dropdown.destroy();
            this._destroyed = true;
        },

        free: function () {
            this.destroy(); //Free is used by commons, destroy by Mendix widgets
        }
    });
});
