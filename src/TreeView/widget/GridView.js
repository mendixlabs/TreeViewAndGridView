require([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "TreeView/widget/Commons",
    "TreeView/widget/GridView/ColHead",
    "TreeView/widget/GridView/Record",
    "TreeView/widget/Commons/Action",
    "TreeView/widget/Commons/ColRenderer",
    "TreeView/widget/Commons/Condition",
    "TreeView/widget/Commons/Filter",
    "TreeView/widget/Commons/FilterManager",
    "TreeView/widget/Commons/RelatedDataset",
    "TreeView/widget/Commons/SearchControl",
    "dojo/NodeList-traverse"
], function(declare, _WidgetBase, Commons, ColHead, Record, Action, ColRenderer, Condition, Filter, FilterManager, RelatedDataset, SearchControl) {
    "use strict"

    return declare("TreeView.widget.GridView", _WidgetBase, {
        _multiSelection: null,
        _inMultiSelectMode: false, //is true as long only checkboxes are clicked
        _hoveredRow: null,
        _started: false,
        _suspended: false,
        _iscallingdatasource: false,
        contextGUID: null,

        currentSortColumn: -1,
        sortInverted: false,
        count: 0,
        curpage: 0,
        firstUpdate: true,


            //data model properties
            tabindex: -1,
            entity: '',
            datasourcemf: '',
            datasourceoffsetattr: '',
            datasourcelimitattr: '',
            datasourcecountattr: '',
            datasourcesearchattr: '',
            constraint: '',

            //display properties
            colheadname: '',
            colheadcaption: '',
            colheadwidth: '',
            colheadsortattr: '',
            colheadsortdir: '',

            //rendering properties
            columnindex: '',
            columnname: '',
            columndataset: '',
            columnrendermode: '',
            columnattr: '',
            columnimage: '',
            columnaction: '',
            columnclazz: '',
            columnstyle: '',
            columndateformat: '',
            columnissearchattr: '',
            columntruecaption: '',
            columnfalsecaption: '',
            columneditable: '',
            columneditdataset: '',
            columneditautocommit: '',
            columnonchangemf: '',
            columncondition: '',
            columnprefix: '',
            columnpostfix: '',

            //action properties
            actname: '',
            actshowbutton: '',
            actclassname: '',
            actautohide: '',
            actbuttoncaption: '',
            actbuttonimage: '',
            actmf: '',
            actmultimf: '',
            actisdefault: '',
            actonselect: '',
            actconfirmtext: '',
            //		actonselect : '',
            actnoselectionmf: '',
            actdataset: '',
            actappliestomultiselection: '',
            actprogressmsg: '',
            //		actshortcut : '',

            //filters
            filterattr: '',
            filtertruecaption: '',
            filterfalsecaption: '',
            filterbooleandefault: '',

            //advanced settings
            allowmultiselect: false,
            allowsingleselect: true,
            selectfirstrow: false,
            defaultsortcolumn: 0,
            pagesize: 20,
            refreshoncontext: false,
            refreshonclass: true,
            searchenabled: true,
            searchplaceholder: '',
            searchlabeldataset: '',
            realtimesearch: false,
            searchmaxquerysizeenabled: false,
            searchmaxquerysize: 10,
            emptymessage: '',
            selectionref: '',
            selectionrefset: '',
            colheaderenabled: true,
            enableschema: true,
            showtotals: true,
            itemcountmessage: '',
            showasdiv: false,
            listenchannel: '',
            singleclickdefaultaction: false,

            //related datasets
            relname: '',
            rellabel: '',
            relentity: '',
            relcontextassoc: '',
            relitemassocref: '',
            relitemassocrefset: '',
            relnameattr: '',
            relnewitemcaption: '',
            relconstraint: '',

            //conditions
            condname: '',
            condattr: '',
            condvalues: '',
            condclass: '',

        /* context applied */
        _contextSubscription : null,

        constructor : function() {
            logger.debug("TreeView.widget.GridView.constructor");

            this.records = [];
            this._multiSelection = [];

            this.columns = [];
            this.colheads = [];
            this.conditions = {};
            this.actions = [];

            this.actionsByName = {};
        },

        postCreate : function() {
            logger.debug("TreeView.widget.GridView.postCreate");

            Commons.fixObjProps(this, ["blaat0", "blaat2", "blaat3", "blaat4", "blaat7", "blaat8"])

            this.verifyDatasourceSettings();

            this._setupDatasets();
            this._setupConditions();

            this._setupLayout();
            this._setupColumns();

            this._setupActions();

            this._setupRendering();
            this._setupEvents();

            if (this.refreshonclass)
                this.subscribe({
                    'entity' : this.entity,
                    callback : dojo.hitch(this, function() {
                        this.fetchAll();
                    })
                });

            if (this.searchenabled) {
                this.searchControl = new SearchControl({
                    searchplaceholder : this.searchplaceholder,
                    labelentity       : this.labelentity,
                    labelcontextassoc : this.labelcontextassoc,
                    labelitemassoc    : this.labelitemassoc,
                    labelnameattr     : this.labelnameattr,
                    dataset           : !this.searchlabeldataset ? null : this.dataset[this.searchlabeldataset],
                    realtime          : this.realtimesearch
                }, this);

                dojo.place(this.searchControl.domNode, this.searchbarNode);
            }

            this._setupFilters();

            //triggers data retrieval as well!
            if (this.defaultsortcolumn < 0 || this.defaultsortcolumn >= this.colheads.length || !this.colheads[this.defaultsortcolumn].getSortAttr())
                if (!this.datasourcemf)
                    this.configError("Invalid default sort column. The column does not exists or no sort attribute has been defined");

            //listening formloader
            if (this.listenchannel)
                this.connect(this, 'onSelect', function(item) {
                    dojo.publish(this.getContent() + "/"+this.listenchannel+"/context", [!item ? null : item.data()]);
                });

            this.setCurrentSortColumn(this.defaultsortcolumn);

            //this.grabStartupFocus();
            setTimeout(dojo.hitch(this, this.grabStartupFocus), 200); //grab focus, but with a small timeout, because wm content manager will grab focus at end of startup chain
        },

        /**
         called by mxclient whenever context is replaced
         */
        update : function(obj, cb) {
            logger.debug("TreeView.widget.GridView.update");

            //use the new context
            this.contextObject = obj;
            this.contextGUID = (this.contextObject && this.contextObject !== undefined) ? this.contextObject.getGuid() : null;

            this.listenToContext();

            //reload
            this.resetAndFetchAll(dojo.hitch(this, this.updateSelectionFromContext));

            mendix.lang.nullExec(cb);
        },

        suspended : function() {
            this._suspended = true;
        },

        resumed : function() {
            this._suspended = false;
            this.resetAndFetchAll(dojo.hitch(this, this.updateSelectionFromContext));
        },

        isSuspended : function() {
            return this._suspended;
        },

        uninitialize : function() {
            logger.debug("TreeView.widget.GridView.uninitialize");
            if (this.searchControl)
                this.searchControl.free();
            if (this.filterManager)
                this.filterManager.free();

            dojo.forEach(this.columns, function(column) {
                column.free();
            });
            dojo.forEach(this.actions, function(action) {
                action.free();
            });
        },

        _setupEvents : function() {
            logger.debug("TreeView.widget.GridView._setupEvents");
            var lc = Commons.liveConnect;

            lc(this, this.gridNode, "onclick", {
                "gv_multiselect_checkbox" : this.multiSelectClick,
                "gv_label_close"    : this.labelClick,
                "gv_label_name"     : this.labelClick,
                "gv_column_wrapper" : this.columnClick,
                "gv_cell" : function(node, e) {
                    this.grabFocus();
                    this.setSelection(this.getRowForNode(node));
                    if (this.singleclickdefaultaction)
                    this.invokeDefaultAction(node, e);
                },
                "gv_th" : function(node, e) {
                    this.setCurrentSortColumn(this.getIndex(node) - 1);
                }
            });

            if (!this.singleclickdefaultaction) {
                lc(this, this.gridNode, "ondblclick", {
                    "gv_cell" : function(target, e) {
                        this.invokeDefaultAction(target, e);
                    }
                });
            }

            var currentcolhover = 0;
            lc(this, this.gridNode, "onmouseover", {
                "gv_row" : this.onRowMouseOver,
                "gv_th" : function(target, e) {
                    dojo.removeClass(target.parentNode.childNodes[currentcolhover], "gv_sort_hover");
                    currentcolhover = this.getIndex(target);
                    dojo.addClass(target, "gv_sort_hover");
                }
            });

            lc(this, this.gridNode, "onmouseout", {
                "gv_th" : function(target) {
                    dojo.removeClass(target, "gv_sort_hover");
                }
            });

            this.connect(this.gridNode, "onmouseout", function(e) {
                var target = e.target;
                //TODO: this can be done more efficient by using onmouseleave and now isDescendant.
                //Not yet supported by webkit though
                if (this._hoveredRow && !dojo.isDescendant(this.gridNode, target)) {
                    dojo.removeClass(this._hoveredRow, 'gv_row_hover');
                    this._hoveredRow = null;
                }
            });

            this.connect(this.gridNode, "onkeypress", this.keypress);
            this.connect(this.pagingNode, "onclick", this.pagingClick);
        },

        _setupLayout : function() {
            logger.debug("TreeView.widget.GridView._setupLayout");
            dojo.addClass(this.domNode, 'gv_grid');
            if (this.showasdiv)
            dojo.addClass(this.domNode, 'gv_floating_grid');

            this.headerNode = mxui.dom.create("div", {'class' : 'gv_header'});

            this.gridNode = mxui.dom.create(this.showasdiv ? "div" : "table", {'class': 'gv_table'});

            this.headerRow = mxui.dom.create(this.showasdiv ? "div" : "tr", {'class':'gv_headrow'}, mxui.dom.create(this.showasdiv ? "div" : "th", { 'class' : 'gv_multiselect_column_head gv_th gv_th_0'}));
            var header = mxui.dom.create(this.showasdiv ? "div" : "thead", {'class':'gv_gridhead'}, this.headerRow);

            dojo.addClass(this.domNode, this.colheaderenabled ? 'gv_columnheaders' : 'gv_nocolumnheaders');
            dojo.addClass(this.domNode, this.allowmultiselect ? 'gv_multiselect_enabled' : 'gv_multiselect_disabled');

            dojo.place(header, this.gridNode, 'first');

            this.footerNode = mxui.dom.create("div", {'class' : 'gv_footer'});
            this.pagingNode = mxui.dom.create("div", {'class' : 'gv_paging'});
            dojo.place(this.pagingNode, this.footerNode);

            this.searchbarNode = mxui.dom.create("div", {'class' : 'gv_searchnode'});
            dojo.place(this.searchbarNode, this.headerNode);

            dojo.place(this.headerNode, this.domNode);
            dojo.place(this.gridNode,   this.domNode);
            dojo.place(this.footerNode, this.domNode);

            dojo.attr(this.gridNode,  {
                tabindex : this.tabindex,
                focusindex : 0
            });

            mxui.wm.focus.addBox(this.gridNode);
            this.grabFocus();
        },

        _setupColumns : function() {
            logger.debug("TreeView.widget.GridView._setupColumns");
            var data = [];
            this.splitPropsTo('colheadname,colheadcaption,colheadwidth,colheadsortattr,colheadsortdir', data);
            for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?
                d.colindex = i;
                var colhead = new ColHead(d, this);
                this.colheads.push(colhead);
            }

            dojo.forEach(this.colheads, function(colhead) {
                colhead.setup(this.headerNode);
            }, this);
        },

        _setupDatasets : function() {
            logger.debug("TreeView.widget.GridView._setupDatasets");
            this.dataset = {};
            var data = [];
            this.splitPropsTo('relname,rellabel,relnewitemcaption,relentity,relcontextassoc,relitemassocref,relitemassocrefset,relnameattr,relconstraint', data);
            dojo.forEach(data, function(item) {
                if (this.dataset[item.relname])
                this.configError('Related dataset "' + item.relname + '" is defined twice!');
                var r = new RelatedDataset(item, this);
                this.dataset[item.relname] = r;
                this.addToSchema((item.relitemassocref || item.relitemassocrefset) + "/" + item.relnameattr);
            }, this);
        },

        _setupActions : function() {
            logger.debug("TreeView.widget.GridView._setupActions");
            var data = [];
            this.splitPropsTo('actname,actprogressmsg,actshowbutton,actclassname,actautohide,actbuttoncaption,actconfirmtext,actbuttonimage,actmf,actmultimf,actappliestomultiselection,actisdefault,actonselect,actnoselectionmf,actdataset', data);
            for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?

                if (d.actmultimf && !!!d.actmf)
                this.configError(d.actname + ": Actions that define a multi selection microflow need to define a single selection microflow as well. ");

                var action = new Action(d, this);

                this.actions.push(action);
                this.actionsByName[action.actname] = action;
            }

            dojo.forEach(this.actions, function(action) {
                action.setup(this.headerNode);
                action.updateToSelection();
            }, this);
        },

        _setupConditions : function() {
            logger.debug("TreeView.widget.GridView._setupConditions");
            var data = [];
            this.splitPropsTo('condname,condattr,condvalues,condclass', data);
            for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?
                var cond = new Condition(d, this);
                if (this.conditions[d.condname])
                this.configError("Condition name '" + d.condname + "' is not unique!");

                this.conditions[d.condname] = cond;
                this.addToSchema(d.condattr);
            }
        },

        _setupFilters: function() {
            logger.debug("TreeView.widget.GridView._setupFilters");
            var data = [];
            this.splitPropsTo('filterattr,filtertruecaption,filterfalsecaption,filterbooleandefault', data);

            var fm = this.filterManager = new FilterManager(this);

            this.filters = dojo.map(data, function(d) {
                return new Filter(d, fm);
            }, this);

            if (this.filters.length > 0)
            dojo.place(fm.domNode, this.actions.length > 0 || !this.searchenabled ? this.headerNode : this.searchbarNode, 'last');
        },

        _setupRendering : function() {
            logger.debug("TreeView.widget.GridView._setupRendering");
            var data = [];
            this.splitPropsTo('columnindex,columnname,columnrendermode,columnattr,columnimage,columneditautocommit,columnonchangemf,columnaction,columnclazz,columnstyle,columnprefix,columnpostfix,columndateformat,columnissearchattr,columntruecaption,columnfalsecaption,columneditdataset,columneditable,columncondition', data);
            for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?
                d.columnentity = this.entity;
                this.columns.push(new ColRenderer(d, this, i));
                if (d.columnindex * 1 >= this.colheads.length)
                this.configError(this.id + "  column index out of bounds: " + d.columnname);

                if (d.columnaction && !(d.columnaction in this.actionsByName))
                this.configError(this.id + "  refers to unknown action " + d.columnaction);

                if (d.columnrendermode === "thumbnail" || d.columnrendermode === "systemimage") {
                    //Add fileID and changedDate to schema
                    if (!d.columnattr)
                    this.addToSchema("FileID");

                    this.addToSchema(d.columnattr.replace(/FileID/, "") + "changedDate");
                }

                this.addToSchema(d.columnattr);
            }
        },

        getContextGUID : function() {
            return this.contextGUID;
        },

        getContextObject : function() {
            return this.contextObject;
        },

        listenToContext : function() {
            logger.debug("TreeView.widget.GridView.listenToContext");
            //if reload on context change is enabled, reload as soon as the context object is altered
            if (this.refreshoncontext) {
                if (this._contextSubscription)
                    mx.data.unsubscribe(this._contextSubscription);

                if (this.contextGUID) {
                    this._contextSubscription = mx.data.subscribe({
                        guid: this.contextGUID,
                        callback : dojo.hitch(this, function() {
                            if (!this._iscallingdatasource)
                                this.resetAndFetchAll(dojo.hitch(this, this.updateSelectionFromContext));
                        })
                    });
                }
            }
        },

        saveAndFireSelection : function(item) {
            logger.debug("TreeView.widget.GridView.saveAndFireSelection");
            this.updatePaging(); //update selected items label

            if (this.selectionref || this.selectionrefset) {
                mx.data.save({
                    mxobj : this.contextObject,
                    callback : dojo.hitch(this, this.onSelect, item),
                    error : this.showError
                }, this);
            } else {
                this.showError(item);
            }
        },

        hasSelection : function() {
            logger.debug("TreeView.widget.GridView.hasSelection");
            return this._multiSelection.length > 0;
        },

        hasMultiSelection : function() {
            return this._multiSelection.length > 1;
        },

        getSelection : function() {
            return this._multiSelection;
        },

        getLastSelection : function() {
            return (this.hasSelection()	? this._multiSelection[this._multiSelection.length -1] : null);
        },

        withSelection : function(scope, cb) {
            dojo.forEach(this._multiSelection, cb, scope);
        },

        addToSelection : function(item, noevents) {
            logger.debug("TreeView.widget.GridView.addToSelection");
            item.checkbox.checked = true;

            if (this.allowsingleselect) {
                dojo.addClass(item.domNode, 'gv_selected');
                dojo.window.scrollIntoView(item.domNode);
            }

            var idx = dojo.indexOf(this._multiSelection, item);
            if (idx === -1)
                this._multiSelection.push(item);

            if(noevents !== true) {
                if (this.selectionref)
                    Commons.store(this.contextObject, this.selectionref,    item.guid);

                if (this.selectionrefset)
                    Commons.store(this.contextObject, this.selectionrefset, item.guid, "add");

                this.saveAndFireSelection(item);
            }
        },

        removeFromSelection : function(item, noevents) {
            logger.debug("TreeView.widget.GridView.removeFromSelection");
            dojo.removeClass(item.domNode, 'gv_selected');
            item.checkbox.checked = false;

            var idx = -1;

            for(var i = 0; i < this._multiSelection.length; i++)
                if (this._multiSelection[i].guid === item.guid) {
                    idx = i;
                    break;
                }

            if (idx > -1)
                this._multiSelection.splice(idx, 1);

            var lastitem = this.getLastSelection();

            if(noevents !== true) {
                if (this.selectionref)
                    Commons.store(this.contextObject, this.selectionref,  lastitem ? lastitem.guid : null);

                if (this.selectionrefset)
                    Commons.store(this.contextObject, this.selectionrefset, item.guid, "rem");

                this.saveAndFireSelection(lastitem);
            }
        },

        setSelection : function(item) {
            logger.debug("TreeView.widget.GridView.setSelection");
            //the same selection?
            if ((!item && !this.hasSelection) || (item && this._multiSelection.length === 1 && this._multiSelection[0] === item)) {
                return;
            }

            this._inMultiSelectMode = false;

            while(this.hasSelection()) {
                this.removeFromSelection(this.getLastSelection(), true);
            }

            if (item) {
                this.addToSelection(item, true);
            }

            if (this.selectionref) {
                Commons.store(this.contextObject, this.selectionref,    item && item.guid);
            }

            if (this.selectionrefset) {
                Commons.store(this.contextObject, this.selectionrefset, item && item.guid);
            }

            if (item) {
                this.saveAndFireSelection(item);
            }
        },

        multiSelectClick : function(node, e) {
            logger.debug("TreeView.widget.GridView.multiSelectClick");
            var record = this.getRowForNode(node);

            if (node.checked)
                this.addToSelection(record);

            else
                this.removeFromSelection(record);
            //}

            this._inMultiSelectMode = this._multiSelection.length > 0;

            return false; //no propagation
        },

        getRecordByGuid : function(guid) {
            logger.debug("TreeView.widget.GridView.getRecordByGuid");
            for(var i = 0; i < this.records.length; i++)
                if (this.records[i].guid == guid)
                    return this.records[i];
            return null;
        },

        /** tries to read the selection data from the context object, and apply it*/
        updateSelectionFromContext : function() {
            logger.debug("TreeView.widget.GridView.updateSelectionFromContext");
            var guids = [];

            if (this.selectionref) {
                var guid = Commons.getObjectAttr(this.contextObject, this.selectionref);
                if (guid)
                    guids.push(guid);
            }
            if (this.selectionrefset) {
                guids = guids.concat(Commons.getObjectAttr(this.contextObject, this.selectionrefset));
            }
            for(var i = 0; i < guids.length; i++) {
                var record = this.getRecordByGuid(guids[i]);
                if (record)
                    this.addToSelection(record, true);
            }

            //select first selection on first update
            if (this.firstUpdate) {
                this.setDefaultSelection();
                this.firstUpdate = false;
            }
        },

        /** tries to reapply the current selection, otherwise, selects the first record */
        reapplySelection : function() {
            logger.debug("TreeView.widget.GridView.reapplySelection");
            var selected = false;
            var guids = [];
            //remember and empty current selection
            //TODO: change triggering can be done more efficient

            //In multi selection, re-select selection if visible, leave the rest as is.
            if (this._inMultiSelectMode) {

                guids = dojo.map(this._multiSelection, function(item) { return item.guid;});

                dojo.forEach(this.records, function(item) {
                    var idx = dojo.indexOf(guids, item.guid);
                    if (idx > -1) {
                        item.checkbox.checked = true;
                        dojo.addClass(item.domNode, 'gv_selected');
                        //replace item in multi selection array with the fresh one, to avoid memory leaks and outdated objects, or any other strange bugs
                        this._multiSelection[idx] = item;
                    }
                }, this);
            }

            //else, deselect all non visible items
            else{

                for (var i = this._multiSelection.length - 1; i >= 0; i--) {
                    guids.push(this._multiSelection[i].guid);
                    this.removeFromSelection(this._multiSelection[i], true);
                }

                dojo.forEach(this.records, function(record) {
                    if (dojo.indexOf(guids, record.guid) > -1) {
                        this.addToSelection(record);
                        selected = true;
                    }
                }, this);

                if (!selected)
                    this.setSelection(null);
            }
        },

        onSelect : function(selection) {
            //stub method to connect events to
        },

        onDefaultAction : function(selection) {
            //stub, this method is invoked when a row is doubleclicked/ return is pressed
        },

        resetAndFetchAll : function(cb) {
            logger.debug("TreeView.widget.GridView.resetAndFetchAll");
            if (!this.isSuspended()) {
                this.curpage = 0;
                this.fetchAll(cb);
            }
        },

        fetchAll : function(cb) {
            logger.debug("TreeView.widget.GridView.fetchAll");
            if (!this.contextGUID || this.isSuspended()) {
                cb && cb();
            }

            else if (this.datasourcemf != '') {
                this.fetchFromMicroflowDatasource(cb);
            } else {
                this.fetchFromDatabaseDatasource(cb);
            }
        },

        fetchFromMicroflowDatasource : function(cb) {
            logger.debug("TreeView.widget.GridView.fetchFromMicroflowDatasource");
            var contextObject = this.contextObject;
            var filter = '';
            if (this.searchenabled)
                filter = this.searchControl.searchInput.getValue();

            contextObject.set(this.datasourceoffsetattr, this.curpage * this.pagesize);
            contextObject.set(this.datasourcelimitattr, this.pagesize);
            contextObject.set(this.datasourcesearchattr, filter && filter != this.searchplaceholder ? filter : '');

            var self = this;

            mx.data.save({
                mxobj : contextObject,
                callback : function(){
                    self._iscallingdatasource = true;
                    mx.data.action({
                        params : {
                            actionname : self.datasourcemf,
                            applyto     : "selection",
                            guids : ["" + contextObject.getGuid()]
                        },
                        callback : function (objlist, xhr) {
                            var count = contextObject.get(self.datasourcecountattr);
                            self.processData(cb, objlist, count);

                            //The refresh instruction that are responded to the datasource mf are processed later than the callback (this callback) with the results itself. So schedule async and hope for the best. (otherwise looping will occur)
                            setTimeout(function() {
                                self._iscallingdatasource = false;
                            }, 1);
                        },
                        error : function(e) {
                            self._iscallingdatasource = false;
                            self.showError(e);
                        }
                    });
                },
                error : function (e) {
                    self.showError(e);
                }
            }, this);
        },

        fetchFromDatabaseDatasource : function(cb) {
            logger.debug("TreeView.widget.GridView.fetchFromDatabaseDatasource");
            var xpath = this.buildXpath();

            var args = {
                xpath    : xpath,
                filter   : this.enableschema ? this._schema : {},
                callback : dojo.hitch(this, this.processData, cb),
                count    : true,
                error    : this.showError
            };

            //sorting
            var sortCol = this.colheads[this.currentSortColumn];
            var sortdir = sortCol.getSortDir();
            if (this.sortInverted)
                sortdir = sortdir === "asc" ? "desc" : "asc";

            if (!sortCol.getSortAttr())
                this.configError("No sortable column : " + this.currentSortColumn + " ("+ sortCol.data.colheadcaption + ")");

            args.filter.sort = [[ sortCol.getSortAttr(), sortdir]];
            args.filter.offset = this.curpage * this.pagesize;
            args.filter.limit  = this.pagesize;

            //perform the get
            mx.data.get(args);
        },

        buildXpath : function () {
            logger.debug("TreeView.widget.GridView.buildXpath");
            var xpath = '//' + this.entity + this.constraint.replace(/\[\%CurrentObject\%\]/gi, this.contextGUID);

            if (this.searchControl) {
                if (!this.searchAttrs)
                    this.searchAttrs = dojo.map(dojo.filter(this.columns, function(column) {
                        return column.columnissearchattr && column.columnattr;
                    }), function(column) {
                        return column.columnattr;
                    });

                if (this.searchmaxquerysizeenabled) {
                    xpath += this.searchControl.getSearchConstraints(this.searchAttrs, this.searchmaxquerysize);
                } else {
                    xpath += this.searchControl.getSearchConstraints(this.searchAttrs);
                }
            }

            xpath += this.filterManager.getSearchConstraints();
            return xpath;
        },

        processData : function(cb, data, count) {
            logger.debug("TreeView.widget.GridView.processData");
            this.count = (dojo.isObject(count) ? count.count : count)*1; //Mx 3 returns primitive, Mx 4 an aggregate object
            this.updatePaging();

            dojo.forEach(this.records, function(record){
                record.free();
            });

            this.records = [];

            function handleElem(data) {
                var r = new Record(data, this);
                this.records.push(r);
                r.setup(this.gridNode);
            }

            dojo.forEach(data, handleElem, this);

            // if the current page is now empty, we should go back one page
            if (count <= this.curpage * this.pagesize && this.curpage > 0) {
                this.curpage -= 1;
                this.fetchAll(cb);
            }
            else {
                cb && cb.call(this); //MWE: cb can influence selection, call callback before reapply?
            }

            this.reapplySelection();
        },

        updatePaging : function() {
            logger.debug("TreeView.widget.GridView.updatePaging");
            dojo.empty(this.pagingNode);

            var lastpage = Math.ceil(this.count / this.pagesize) - 1;
            var PAGERSIZE = 3;

            // Do we need to reset the current page? (count < limit)
            if (this.count < this.pagesize) {
                this.curpage = 0;
            }

            //show paging at all?
            if (this.count > this.pagesize || this.curpage > 0) {
                //show prev btn?
                if (this.curpage > 0)
                    dojo.place(mxui.dom.create("a", { 'class' : 'gv_btn_prev'}, "<"), this.pagingNode);

                //page 1
                dojo.place(mxui.dom.create("a", { 'class' : 'gv_btn_page ' + (0 === this.curpage ? 'gv_btn_page_active' : '')}, "1"), this.pagingNode);

                //paging skipper?
                if (this.curpage > PAGERSIZE)
                    dojo.place(mxui.dom.create("a", { 'class' : 'gv_btn_paging_spacer'}, ".."), this.pagingNode);

                for(var i = Math.max(this.curpage - PAGERSIZE + 1, 1); i < Math.min(this.curpage + PAGERSIZE , lastpage); i++)
                    dojo.place(mxui.dom.create("a", { 'class' : 'gv_btn_page ' + (i === this.curpage ? 'gv_btn_page_active' : '')}, "" + (i + 1)), this.pagingNode);

                //paging skipper?
                if (this.curpage < lastpage - PAGERSIZE)
                    dojo.place(mxui.dom.create("a", { 'class' : 'gv_btn_paging_spacer'}, ".."), this.pagingNode);

                //last page
                dojo.place(mxui.dom.create("a", { 'class' : 'gv_btn_page ' + (lastpage === this.curpage ? 'gv_btn_page_active' : '')}, "" + (lastpage + 1)), this.pagingNode);

                //show next btn?
                if (this.curpage < lastpage)
                    dojo.place(mxui.dom.create("a", { 'class' : 'gv_btn_next'}, ">"), this.pagingNode);

            }

            if (this.count === 0) {
                dojo.place(mxui.dom.create("span", {'class' : 'gv_empty_message'}, this.emptymessage), this.pagingNode);
            }
            else if (this.showtotals)
                dojo.place(mxui.dom.create("span", {'class' : 'gv_paging_totals'},
                    (this.itemcountmessage || (this._multiSelection.length > 1 ? "{1} of {0} item(s) selected." : "{0} item(s) in total")).replace("{0}", this.count).replace("{1}", this._multiSelection.length)
                ), this.pagingNode);
        },

        pagingClick : function(e) {
            logger.debug("TreeView.widget.GridView.pagingClick");
            if (dojo.hasClass(e.target, "gv_btn_prev"))
                this.prevPage();

            else if (dojo.hasClass(e.target, "gv_btn_next"))
                this.nextPage();

            else if (dojo.hasClass(e.target, "gv_btn_page"))
                this.curpage = (1 * e.target.innerHTML) - 1;

            else
                return;

            this.fetchAll();
        },

        prevPage : function() {
            logger.debug("TreeView.widget.GridView.prevPage");
            if (this.curpage > 0) {
                this.curpage -= 1;
                this.fetchAll(function() {
                    //select last item when going to previous page
                    if (!this._inMultiSelectMode) {
                        if (this.gridNode.childNodes.length > 1)
                            this.setSelection(this.getRowForNode(this.gridNode.childNodes[this.gridNode.childNodes.length - 1]));
                        else
                            this.setSelection(null);
                    }
                });
            }
        },

        nextPage : function() {
            logger.debug("TreeView.widget.GridView.nextPage");
            if (this.curpage < Math.ceil(this.count / this.pagesize) -1) {
                this.curpage += 1;
                this.fetchAll(function() {
                    if (!this._inMultiSelectMode) {
                        this.selectFirstItem();
                    }
                });
            }
        },

        selectFirstItem : function() {
            logger.debug("TreeView.widget.GridView.selectFirstItem");
            if (this.gridNode.childNodes.length > 1)
                this.setSelection(this.getRowForNode(this.gridNode.childNodes[1]));
            else
                this.setSelection(null);
        },

        setDefaultSelection: function(){
            logger.debug("TreeView.widget.GridView.setDefaultSelection");
            if (this.selectfirstrow) {
                this.selectFirstItem();
            }
        },

        grabStartupFocus : function() {
            logger.debug("TreeView.widget.GridView.grabStartupFocus");
            if (this.searchenabled)
                mxui.wm.focus.put(this.searchControl.searchInput.textbox);
            else
                this.grabFocus();
        },

        grabFocus : function() {
            logger.debug("TreeView.widget.GridView.grabFocus");
            if (mxui.wm.focus.get() !== this.gridNode)
                mxui.wm.focus.put(this.gridNode);
        },

        getIndex : function(node) {
            logger.debug("TreeView.widget.GridView.getIndex");
            return typeof node.cellIndex === "number" ? node.cellIndex : dojo.query(node.parentNode).children().indexOf(node);
        },

        keypress : function(e) {
            logger.debug("TreeView.widget.GridView.keypress");
            var record = this.getLastSelection();//this.getRowForNode(e.target);
            if (record) {
                var handled = true;
                switch (e.keyCode) {
                    case dojo.keys.SPACE:
                        //TODO: this and arrow up & down needs distinction between selection and focus to work properly!
                        if (this.allowmultiselect)
                            if (record.checkbox.checked) {
                                if (this.hasMultiSelection()) //do not remove last from selection
                                    this.removeFromSelection(record);
                            }
                            else
                                this.addToSelection(record);

                    case dojo.keys.ENTER:
                        this.invokeDefaultAction();
                        break;
                    case dojo.keys.DOWN_ARROW :
                        var next = this.getRowForNode(record.domNode.nextElementSibling);
                        if (next) {
                            if (!this._inMultiSelectMode)
                                this.setSelection(next);
                        }
                        else
                            this.nextPage();
                        break;
                    case dojo.keys.UP_ARROW :
                        var prev = this.getRowForNode(record.domNode.previousElementSibling);
                        if (prev) {
                            if (!this._inMultiSelectMode)
                                this.setSelection(prev);
                        }
                        else
                            this.prevPage();
                        break;
                    case dojo.keys.PAGE_UP:
                    case dojo.keys.LEFT_ARROW:
                        this.prevPage();
                        break;
                    case dojo.keys.PAGE_DOWN:
                    case dojo.keys.RIGHT_ARROW:
                        this.nextPage();
                        break;
                }
            }
            if (handled) {
                dojo.stopEvent(e);
            }
        },

        invokeDefaultAction : function() {
            logger.debug("TreeView.widget.GridView.invokeDefaultAction");
            for(var i = 0, a = null; a = this.actions[i++];)
                if (a.actisdefault && a.appliesToSelection())
                    a.invokeOnSelection();
        },

        onRowMouseOver : function(target, e) {
            if (target !== this._hoveredRow) {
                this._hoveredRow && dojo.removeClass(this._hoveredRow, 'gv_row_hover');
                dojo.addClass(target, 'gv_row_hover');
                this._hoveredRow = target;
            }

            e.preventDefault();
            dojo.stopEvent(e);
            return false; //stop further events
        },

        getRowForNode : function (node) {
            logger.debug("TreeView.widget.GridView.getRowForNode");
            if (!node)
                return null;
            if (dojo.hasClass(node, "gv_row")) // EvdP: yes, functionality now depends on a classname, but this can only be avoided by using parentNode, which is errorprone for changes.
                return mxui.dom.data(node, "data");
            return this.getRowForNode(node.parentNode);
        },

        labelClick : function(node) {
            logger.debug("TreeView.widget.GridView.labelClick");
            var isClose = dojo.hasClass(node, 'gv_label_close');
            node = node.parentNode;

            //assuming dataset: { owner: record, guid : guid, dataset: this.columneditdataset, colindex: this.colindex }
            var data = mxui.dom.data(node, "data");
            var record = data.owner;
            var guid   = data.guid;
            var dataset = this.dataset[data.dataset];
            var rnd    = this.columns[data.colindex];
            if (!(record && guid && dataset && rnd))
                this.showError("Unable to handle labelclick!");

            if (isClose)
                rnd.applyChange(record, guid, true);

            //clicked on a searchable label?
            else if (dataset === this.dataset[this.searchlabeldataset])
                this.searchControl.setSearchFilter('', dataset.existingLabelsById[guid]);
            else {
                //TODO: onclick label action
            }
        },

        columnClick : function(node) {
            logger.debug("TreeView.widget.GridView.columnClick");
            var col = mxui.dom.data(node, 'colindex');
            var record = this.getRowForNode(node);

            this.columns[col].invokeAction(record);
        },

        setCurrentSortColumn : function(index) {
            logger.debug("TreeView.widget.GridView.setCurrentSortColumn");
            if (this.colheads[index].getSortAttr()) {
                //MWE: note that colhead index is one less the the TH index in the domTree
                var colnode = this.headerRow.childNodes[index + 1];

                if (index === this.currentSortColumn) {
                    this.sortInverted = !this.sortInverted;
                    dojo.removeClass(colnode, 'gv_sort_up gv_sort_down');

                }
                else {
                    if (this.currentSortColumn > -1)
                        dojo.removeClass(this.headerRow.childNodes[this.currentSortColumn +1], 'gv_sortcolumn gv_sort_up gv_sort_down');

                    this.currentSortColumn = index;
                    this.sortInverted = false;
                }

                dojo.addClass(colnode, 'gv_sortcolumn ' + ("asc"  === this.colheads[index].getSortDir() ^ this.sortInverted ? 'gv_sort_up' : 'gv_sort_down'));
                this.resetAndFetchAll();
            }
            //else
            //		this.configError("Invalid (default) sort column. The column does not exists or no sort attribute has been defined");
        },

        verifyDatasourceSettings : function() {
            logger.debug("TreeView.widget.GridView.verifyDatasourceSettings");
            if (this.datasourcemf) {
                if (!(this.datasourceoffsetattr && this.datasourcelimitattr && this.datasourcecountattr))
                    this.configError("Offset, Limit and Count attributes need to be set if a data source microflow is used.");

                if (this.searchenabled && !this.datasourcesearchattr)
                    this.configError("Search attribute s need to be set if a data source microflow is used and search is enabled.");

                if (this.defaultsortcolumn !== 0)
                    this.configError("Sorting is not supported if a data source microflow is used.");

                if (this.relname)
                    this.configError("Datasets are not allowed if a datasource microflow is used");

                if (this.filterattr)
                    this.configError("Filters are not allowed if a datasource microflow is used");

                if (this.entityConstraint)
                    this.configError("An entity constraint and datasource microflow cannot be used at the same time");
            }
        },

        _schema : null,
        addToSchema : function( attr) {
            logger.debug("TreeView.widget.GridView.addToSchema");
            if (!attr)
            return;

            if (!this._schema)
            this._schema = { references : {}, attributes : [] };

            if (attr.indexOf("/") > -1) {

                var parts = attr.split("/");

                if (!(parts[0] in this._schema.references))
                this._schema.references[parts[0]] = { attributes : []};

                if (parts.length > 2)
                this._schema.references[parts[0]].attributes.push(parts[2]);
            }
            else {
                this._schema.attributes.push(attr);
            }
        },

        showError : function(e) {
            logger.debug("TreeView.widget.GridView.showError");
            Commons.error(e, this);
        },

        mf : function(mf, data, callback) {
            logger.debug("TreeView.widget.GridView.mf");
            Commons.mf(mf, data, callback, this);
        },

        configError : function(msg) {
            logger.debug("TreeView.widget.GridView.configError");
            Commons.configError(this, msg);
        },

        splitPropsTo : function(props, target) {
            logger.debug("TreeView.widget.GridView.splitPropsTo");
            Commons.splitPropsTo(this, props, target);
        }
    });
});
