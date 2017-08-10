define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dijit/form/ComboBox",
    "TreeView/widget/Commons"
], function(declare, lang, ComboBox, Commons) {
    "use strict"

    return declare("TreeView.widget.Commons.SearchControl", null, {
        dataset: null,

        domNode: null,
        widget: null,

        searchfilter: "",
        searchlabel: null,
        realtime: false,
        hasDataset: true,

        _isSearching: false,
        _searchPending: false,

        constructor: function (args, widget) {
            dojo.mixin(this, args);

            this.widget = widget;

            this._setupLayout();
            this._setupSearch();

        },

        _setupLayout: function () {
            this.domNode = mxui.dom.create("div", {
                "class": "gv_searchBar"
            });

            this.labelContainer = mxui.dom.create("div", {"class": "gv_searchLabelContainer"});
            dojo.place(this.labelContainer, this.domNode);
        },

        _setupSearch: function () {
            //no dataset? setup stub dataset
            if (this.dataset == null) {
                this.hasDataset = false;
                this.dataset = dojo.mixin({
                        _fetchItems: lang.hitch(this, function (query, resultcallback) {
                            resultcallback([], query);
                        }),

                        getValue: lang.hitch(this, function (item, _) {
                            return null;
                        })
                    },
                    dojo.data.util.simpleFetch
                );
            }

            this.searchInput = new ComboBox({
                store: this.dataset, //MWE: TODO: works if null?
                queryExpr: "${0}",
                searchAttr: "name",
                searchDelay: 0,
                tabIndex: 0,
                hasDownArrow: false,
                autoComplete: false,

                onKeyUp: lang.hitch(this, function (e) {
                    if (e.keyCode == dojo.keys.DOWN_ARROW && !this.hasDataset && this.widget.selectFirstItem) { //MWE on arrow down, put focus on grid, but only if no labels are used
                        this.widget.selectFirstItem();
                        this.widget.grabFocus();
                    } else if (e.keyCode == dojo.keys.ENTER) {
                        if (this.searchInput.item != null)
                            this.setSearchFilter("", this.searchInput.item);
                        else {
                            this.setSearchFilter(this.searchInput.get("value"), null);
                        }
                    } else if (e.keyCode == dojo.keys.TAB) {
                        if (this.searchInput.item != null) { //do not tab away if tab is used to select an item
                            this.setSearchFilter("", this.searchInput.item);
                            dojo.stopEvent(e);
                        }
                    } else if (e.keyCode == dojo.keys.SPACE) {
                        var name = dojo.trim(this.searchInput.get("value").toLowerCase());
                        for (key in this.existingLabels) //check whether first part is an label, recognize it.
                            if (name == key) {
                                this.setSearchFilter("", this.existingLabels[key]);
                                break;
                            }
                    } else if (this.realtime) {
                        if (!this._isSearching) {
                            this.setSearchFilter(this.searchInput.get("value"), null);
                        } else {
                            this._searchPending = true;
                        }
                    }
                }),

                onChange: lang.hitch(this, function (e) {
                    if (this.searchInput.item != null) {//only auto search on blur if label selection was made
                        this.setSearchFilter("", this.searchInput.item);
                    }
                }),

                resize: function () {

                }
            });

            this.searchInput.loadDropDown();
            dojo.addClass(this.searchInput.dropDown.domNode, "gv_search_labeldropdownmenu");

            var tb = this.searchInput.textbox;
            var self = this;

            tb.value = this.searchplaceholder;
            dojo.addClass(tb, "tg_search_placeholder");

            this.widget.connect(tb, "onfocus", function () {
                if (self.searchplaceholder == tb.value){
                    tb.value = "";
                }
                dojo.removeClass(tb, "tg_search_placeholder");
            });

            this.widget.connect(tb, "onblur", function () {
                if ("" == tb.value && self.searchlabel == null) {
                    tb.value = self.searchplaceholder;
                    dojo.addClass(tb, "tg_search_placeholder");
                }
            });

            dojo.place(this.searchInput.domNode, this.domNode);

            //this.connect(this.searchSubmit, "onclick", lang.hitch(this, this.performSearch));
            // this.connect(this.searchReset, "onclick", lang.hitch(this, this.resetAndFetchAll));
            this.widget.connect(this.labelContainer, "onclick", lang.hitch(this, function (evt) {
                if (dojo.hasClass(evt.target, "gv_label_close")){
                    this.setSearchFilter(this.searchInput.get("value"), null);//remove the label selection
                }
            }));


        },

        updateSearchLabel: function (label) {
            dojo.empty(this.labelContainer);
            if (label != null) {
                var labelname = label.get(this.dataset.relnameattr);
                dojo.place(Commons.renderLabel(labelname, true), this.labelContainer);
            }
        },

        setSearchFilter: function (searchfilter, searchlabel) {
            if (this.searchfilter != searchfilter || this.searchlabel != searchlabel) {
                this._isSearching = true;
                this.searchfilter = searchfilter;
                this.searchlabel = searchlabel;

                //			this.searchInput.set("value", searchfilter);
                this.updateSearchLabel(searchlabel);

                this.widget.curpage = 0;
                this.widget.fetchAll(lang.hitch(this, function () {
                    this._isSearching = false;

                    //There were one ore more searches triggered while we were searching..
                    if (this._searchPending) {
                        this._searchPending = false;
                        this.setSearchFilter(this.searchInput.get("value"), null);//TODO: how does this relate to this.searchInput.item?
                    }
                }));
            }

        },

        getSearchConstraints: function (searchAttrs, limit) {
            //search for term xpath
            var xpath = "";

            if (!searchAttrs.length){
                this.widget.configError("No search attributes defined!");
            }

            if (this.searchfilter) {
                var filtervalues = dojo.map(this.searchfilter.split(/\s+/), mxui.html.escapeQuotes);

                if (typeof limit !== "undefined" && filtervalues.length > limit) {
                    filtervalues.splice(limit, filtervalues.length - limit);
                }

                //we want every search value to occur at least once! In one of the attributes
                xpath += "[(" + dojo.map(filtervalues, function (fv) {
                        return dojo.map(searchAttrs, function (attr) {
                            return "contains(" + attr + ",'" + fv + "')";
                        }).join(" or ");
                    }, this).join(") and (") + ")]";
            }

            if (this.searchlabel != null){
                xpath += "[" + this.dataset.getAssoc() + " = '" + this.searchlabel.getGuid() + "']";
            }

            return xpath;
        },

        free: function () {
            if (this.searchInput) {
                 this.searchInput.destroy();
            }
        }
    });
});
