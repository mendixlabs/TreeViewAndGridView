define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/dom-style",
    "TreeView/widget/Commons",
    "TreeView/widget/Commons/Dropdown",
], function(declare, lang, domStyle, Commons, DropDown) {
    "use strict"

    return declare("TreeView.widget.Commons.Action", null, {
        //Not functional
        actname : "",
        actentity : "",
        actshowbutton : "",
        actclassname : "",
        actbuttoncaption : "",
        actbuttonimage : "",
        actmf : "",
        actmultimf : "",
        actisdefault : false,
        actonselect  : false,
        actnoselectionmf : "",
        actshortcut : "",
        actautohide : "",
        actconfirmtext : "",
        actdataset : "",
        actappliestomultiselection : true,
        actprogressmsg : "",
        //*Not functional

        tree : null,

        constructor : function(args, tree) {
            this.tree = tree;
            dojo.mixin(this, args);

            this.tree.connect(this.tree, "onSelect", lang.hitch(this, this.updateToSelection));
        },

        assignRefToSelection : function(item) {
            if (!this.actmf)
                this.configError("No selection microflow defined for association assignment button");

            Commons.store(
                //records to objects
                dojo.map(this.tree.getSelection(), function(item) { return item.data(); }),

                this.dataset.getAssoc(), item, "add", false,
                //callback
                lang.hitch(this, function() {
                    this.invokeOnSelection();

                    this.mxbutton.set("value", null);
                })
            );

        },

        setup : function(parentNode) {
            if (this.actshowbutton) {
                if (this.actdataset) {

                    this.dataset = this.tree.dataset[this.actdataset];
                    if (this.dataset == null){
                        this.tree.configError("Unknown dataset for action: '" + this.actdataset + "'");
                    }
                    if (!this.actappliestomultiselection){
                        this.tree.configError("Reference assignment should be allowed to be applied to multi selections! (see the action allow to multiselection property)");
                    }

                    this.mxbutton = new DropDown({
                            onChange : lang.hitch(this, this.assignRefToSelection),
                            sticky   : false,
                            label    : this.dataset.rellabel,
                            dataset  : this.dataset,
                            className : " gv_action_dropdown " + this.actclassname
                        },
                        parentNode,
                        null
                    );
                }
                else {
                    this.mxbutton = new mxui.widget._Button({
                        caption     : this.actbuttoncaption,
                        iconUrl     : this.actbuttonimage,
                        onClick     : lang.hitch(this, this.invokeOnSelection),
                        type        : "button",
                        cssclass    : this.actclassname,
                        //title       : column.help, //TODO:?
                        isInactive  : false
                    });
                    dojo.place(this.mxbutton.domNode, parentNode);
                }
            }

            if (this.actonselect) {
                this.tree.connect(this.tree, "onSelect", lang.hitch(this, this.invokeOnSelection));
            }
        },

        appliesToSelection : function() {
            if (this.actnoselectionmf){
                return true;
            }

            if  ((!this.tree.hasSelection() || !this.actmf) || (this.tree.hasMultiSelection() && !this.actappliestomultiselection))
                return false;

            return this.appliesTo(this.tree.getSelection());
        },

        //Check if this action is applicable to the mentioned item or item list
        appliesTo : function (item) {
            if (!this.actentity){
                return true;
            }

            var applies = true;
            if (dojo.isArray(item)) {
                for(var i = 0; i < item.length; i++){
                    applies &= this.appliesTo(item[i]);
                }
                return applies;
            }

            return item.isA(this.actentity);
        },

        //show, hide, enable, disable based on the current selection
        updateToSelection : function() {
            if (this.actshowbutton) {
                var enable = this.appliesToSelection();

                if (!this.mxbutton._destroyed)  {//MWE: wtf?
                    this.mxbutton.set("disabled", !enable);
                    if (this.actautohide){
                        domStyle.set(this.mxbutton.domNode, "display", enable ? "inline-block" : "none");
                    } else {
                        (enable ? dojo.removeClass : dojo.addClass)(this.mxbutton.domNode, "gv_button_disabled");
                    }
                }
            }
        },

        //invoke, but on the current selection / context, that is, the button is triggered from the header
        invokeOnSelection : function() {
            if (this.appliesToSelection()) {
                var selection = this.tree.getSelection();

                //invoke on the data of the selected node
                if (selection && (this.actmf || this.actmultimf)){
                    this.invoke(selection);
                }

                //invoke on the root object
                else if (this.actnoselectionmf) {
                    Commons.confirm(this.actconfirmtext, lang.hitch(this, function() {
                        Commons.mf(this.actnoselectionmf, this.tree.getContextObject(), null, this.tree, false, this.actprogressmsg);
                    }));
                }
            }
        },

        invoke : function(selection) {
            if ((this.actmf || this.actmultimf) && this.appliesTo(selection)) { //double check applies to, see #15349



                Commons.confirm(this.actconfirmtext, lang.hitch(this, function() {
                    //if a new item is added, suggest it as new selection
                    delete this._recordSelectionSuggestion;
                    this.tree._recordSelectionSuggestion = true;

                    //See ticket 9116, we need to invoke the single argument microflow version for a single argument. Multi argument mf will break
                    if (dojo.isArray(selection) && selection.length > 1 && this.actmultimf){
                        Commons.mf(this.actmultimf, dojo.map(selection, function(item) { return item.data(); }), null, this.tree, true, this.actprogressmsg);
                    } else {
                        var sel = selection == null || selection == []
                            ? []
                            : dojo.isArray (selection)
                            ? dojo.map(selection, function(item) { return item.data() })
                            : selection.data();

                        Commons.mf(this.actmf, sel, null, this.tree, false, this.actprogressmsg);
                    }
                }));
            }
        },

        free : function() {
            if (this.mxbutton && !this.mxbutton._destroyed) {
                this.mxbutton.destroy();
            }
        }
    });
});
