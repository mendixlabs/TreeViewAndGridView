require([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dojo/_base/lang",
    "dojo/dom-attr",
    "dojo/dom-style",
    "TreeView/widget/Commons",
    "TreeView/widget/Commons/ColRenderer",
    "TreeView/widget/TreeView/Edge",
    "TreeView/widget/TreeView/GraphNode",
    "TreeView/widget/Commons/Action",
    "dojo/NodeList-traverse"
], function (declare, _WidgetBase, lang, attr, domStyle, Commons, ColRenderer, Edge, GraphNode, Action) {
    "use strict";


    return declare("TreeView.widget.TreeView", [_WidgetBase], {
        root: null, //render node
        dict: null, //guid -> GraphNode
        types: null, //type definitions : entityName -> config
        useDnd: false,

        edgesByParent: null, //parentguid.associndex.childguid
        edgesByOwner: null, //ownerguid.associndex.[idx]
        _selection: null,
        dnd: null, //dnd state
        _hoveredRow: null,
        _hoveredCol: null,
        selectionrefs: null,
        _parent: null,

        inputargs: {
            //data model properties
            tabindex: -1,
            entity: "",
            parentassocsingle: "",
            parentassocmulti: "",
            assoctype: "",
            assoccaption: "",
            showassocname: "",
            constraint: "",
            allowdnd: "",
            allowdndcopy: "",
            dropmf: "",
            assocclazz: "",
            assocstyle: "",

            //display properties
            columnname: "",
            columnentity: "",
            columnrendermode: "",
            columnattr: "",
            columnimage: "",
            columnaction: "",
            columnclazz: "",
            columnstyle: "",
            columndateformat: "",
            columnprefix: "",
            columnpostfix: "",
            columntruecaption: "",
            columnfalsecaption: "",

            //action properties
            actname: "",
            actentity: "",
            actshowbutton: "",
            actautohide: "",
            actbuttoncaption: "",
            actbuttonimage: "",
            actconfirmtext: "",
            actmf: "",
            actisdefault: "",
            actonselect: "",
            actnoselectionmf: "",
            actshortcut: "",
            actprogressmsg: "",

            //Selection references
            selectionref: "",

            //advanced settings
            xentity: "",
            xburstattr: "",
            xlisteningform: "",
            sortattr: "",
            sortdir: "",
            entityclazz: "",
            entitystyle: "",
            entitychannel: "",
            allowmultiselect: false,
            selectionrefset: "",

            //general properties
            expandall: 1,
            prefetch: true,
            hiderootnode: true,
            expandmode: "arrow", //arrow | row | accordion
            multiselect: false
        },

        constructor: function () {
            logger.debug("TreeView.widget.TreeView.startup");

            this.dict = {};
            this.types = [];
            this.columns = [];
            this.actions = [];
            this.actionsByName = {};
            this.dnd = {};

            this.edgesByParent = {};
            this.edgesByOwner = {};

            this.xsettings = [];
        },

        postCreate: function () {
            Commons.fixObjProps(this, ["blaat4", "blaat", "blaat2", "blaat3", "blaat5"]);

            this.splitPropsTo("xentity,xburstattr,sortattr,sortdir,entityclazz,entitystyle,entitychannel", this.xsettings);
            for (var i = 0; i < this.xsettings.length; i++) {
                var x = this.xsettings[i];
                x.entitystyle = x.entitystyle.split(/\||\n/).join(";");
                x.filter = { references: {}, attributes: [] };

                this.addToSchema(x.xentity, x.xburstattr);
                this.addToSchema(x.xentity, x.sortattr);

                if (x.entitychannel) {
                    var onSelectHandler =
                        this.connect(this, "onSelect", lang.hitch(this, function (channel, entity, selection) {
                            if (selection != null && selection.isA(entity)) {
                                // KVL: This used to use this.getContent() as the first part, but that no longer exists.
                                // Not sure what the alternative is, so we might want to look into that...
                                dojo.publish("/" + channel + "/context", [selection.data()]);
                            } else {
                                // KVL: This used to use this.getContent() as the first part, but that no longer exists.
                                // Not sure what the alternative is, so we might want to look into that...
                                dojo.publish("/" + channel + "/context", [null]);
                            }
                        }, x.entitychannel, x.xentity));
                }
            }

            if (this.selectionref && this.selectionref != "") {
                this.selectionrefs = this.selectionref.split(";");
            }


            this._setupTypes();

            this._setupLayout();
            this._setupActions();

            this._setupColumns();
            this._setupEvents();
        },

        /* context applied */
        update: function (data, cb) {
            logger.debug("TreeView.widget.TreeView.update");

            var guid = (data && data !== undefined) ? data.getGuid() : null;
            if (this.root != null && this.root.guid == guid) { //already the root, just refresh
                this.processData([data]);
            } else {
                if (!this.getXsettings(data.getEntity())) {
                    this.configError("The context of this widget is a '" + data.getEntity() + "', but this type is not further defined in the entities property of the treeview");
                }

                if (this.root) {
                    this.root.free();
                }

                this.dict[guid] = new GraphNode(this, data, true);
                this.root.forNodes(function (node) {
                    node.draw();

                    //unfold roots by default (note, should be one)
                    node.setCollapsed(false);
                });

                this.selectFirstItem();
            }

            cb && cb();
        },


        uninitialize: function () {
            logger.debug("TreeView.widget.TreeView.uninitialize");

            if (this.root) {
                this.root.free();
            }

            if (this.searchControl) {
                this.searchControl.free();
            }

            dojo.forEach(this.columns, function (column) {
                column.free();
            });

            dojo.forEach(this.actions, function (action) {
                action.free();
            });

            // Free all graph nodes and their subscription
            for (var key in this.dict) {
				if (this.dict.hasOwnProperty(key)) {           
					this.dict[key].free();
				}
			}
        },

        /* MWE: not sure if these suspended are supposed here, or where deliberately deleted before merging with main branch..
         if it gives issues, the methods suspended / resumed should be deleted probably*/
        suspended: function () {

        },


        resize: function () {
            // stub function
        },

        resumed: function () {
            logger.debug("TreeView.widget.TreeView.resumed");

            //reapply selection to continue formloader
            var sel = this._selection;
            this._selection = null;
            this.setSelection(this._selection);
        },

        _setupLayout: function () {
            logger.debug("TreeView.widget.TreeView._setupLayout");

            dojo.addClass(this.domNode, "gg_tree");
            this.headerNode = mxui.dom.create("div", { "class": "gg_header" });

            this.treeNode = mxui.dom.create("ul", { "class": "gg_children gg_root_wrapper" });
            if (this.hiderootnode) {
                dojo.addClass(this.treeNode, "gg_hiddenroot");
            }

            dojo.place(this.headerNode, this.domNode);
            dojo.place(this.treeNode, this.domNode);
            attr.set(this.treeNode, {
                tabindex: this.tabindex,
                focusindex: 0
            });

            if (mxui.wm && mxui.wm.focus && mxui.wm.focus.addBox) {
                mxui.wm.focus.addBox(this.treeNode);
            }

            this.grabFocus();
        },

        _setupActions: function () {
            logger.debug("TreeView.widget.TreeView._setupActions");

            var data = [];
            this.splitPropsTo("actname,actprogressmsg,actentity,actshowbutton,actautohide,actbuttoncaption,actconfirmtext,actbuttonimage,actmf,actisdefault,actonselect,actnoselectionmf", data);
            for (var i = 0, d = null; d = data[i]; i++) {
                var action = new Action(d, this);
                this.actions.push(action);
                this.actionsByName[action.actname] = action;
            }

            dojo.forEach(this.actions, function (action) {
                action.setup(this.headerNode);
                action.updateToSelection();
            }, this);
        },

        _setupTypes: function () {
            logger.debug("TreeView.widget.TreeView._setupTypes");

            this.splitPropsTo("entity,parentassocsingle,parentassocmulti,constraint,sortattr,sortdir,assoctype,assoccaption,showassocname,allowdnd,allowdndcopy,dropmf,assocclazz,assocstyle", this.types);
            var i = 0;
            dojo.forEach(this.types, function (type) {
                //more householding
                type.isRefset = type.parentassocsingle === "" || !type.parentassocsingle;
                type.assoc = type.isRefset ? type.parentassocmulti : type.parentassocsingle;

                type.index = i++;

                if (!type.assoc)
                    this.configError("The relation '" + type.assoccaption + "' did not define a reference");

                delete type.parentassocmulti;
                delete type.parentassocsingle;

                type.parententity = type.assoc.split("/")[1];
                type.ownerentity = type.entity; //owner is always the entity

                if (type.allowdnd) {
                    if (!type.dropmf)
                        this.configError("The relation '" + type.assoccaption + "' allows drag and drop, but has no drop Microflow");
                    //drag and drop needs the data to be able to update the object. This however is a costly data overhead...
                    this.addToSchema(type.ownerentity, type.assoc);
                }

                type.assoc = type.assoc.split("/")[0];

                //swap entity types if assoctype is "from parent"
                if (type.assoctype == "fromparent") {
                    var e = type.entity;
                    type.entity = type.parententity;
                    type.parententity = e;
                }

                type.recursive = mx.meta.getEntity(type.entity).isA(type.parententity);

                type.assocstyle = type.assocstyle ? type.assocstyle.split(/\||\n/).join(";") : "";

                this.useDnd |= type.allowdnd;
            }, this);
        },

        _setupColumns: function () {
            logger.debug("TreeView.widget.TreeView._setupColumns");

            var data = [];
            this.splitPropsTo("columnname,columnentity,columnrendermode,columnattr,columnimage,columnaction,columnclazz,columnstyle,columndateformat,columnprefix,columnpostfix,columntruecaption,columnfalsecaption", data);
            for (var i = 0, d = null; d = data[i]; i++) {
                this.columns.push(new ColRenderer(d, this, i));
                if (d.columnaction && !(d.columnaction in this.actionsByName))
                    this.configError(this.id + "  refers to unknown action " + d.columnaction);

                if (d.columnrendermode == "thumbnail" || d.columnrendermode == "systemimage") {
                    //Add fileID and changedDate to schema
                    if (d.columnattr == "") {
                        this.addToSchema(d.columnentity, "FileID");
                    }

                    this.addToSchema(d.columnentity, d.columnattr.replace(/FileID/, "") + "changedDate");
                }

                this.addToSchema(d.columnentity, d.columnattr);
            }
        },

        getContextGUID: function () {
            logger.debug("TreeView.widget.TreeView.getContextGUID");

            return this.root._data.getGuid();
        },

        getContextObject: function () {
            logger.debug("TreeView.widget.TreeView.getContextObject");

            return this.root._data;
        },

        setSelection: function (renderNode) {
            logger.debug("TreeView.widget.TreeView.setSelection");

            if (renderNode != this._selection) {
                if (!this._parent && renderNode) {
                    this._parent = renderNode.parent;
                }

                if (this._selection && this._parent != this._selection) {
                    this.testreferences(this._selection);
                }

                //remove old styling
                if (this._selection && this._selection.domNode)
                    dojo.removeClass(this._selection.domNode, "gg_selected");

                //set new selection and styling
                this._selection = renderNode;
                if (renderNode) {
                    dojo.addClass(this._selection.domNode, "gg_selected");
                    dojo.window.scrollIntoView(renderNode.domNode);
                }

                this.saveAndFireSelection(renderNode);

                //update actions
                dojo.forEach(this.actions, function (action) {
                    action.updateToSelection();
                });
            }
        },


        testreferences: function (node) {
            logger.debug("TreeView.widget.TreeView.testreferences");

            if (this.selectionrefs) {
                for (var i = 0; i < this.selectionrefs.length; i++) {
                    if (this.selectionrefs[i].indexOf(node.graphNode.type) > -1 && this.selectionrefs[i].indexOf("/") == -1) {
                        Commons.store(this.getContextObject(), this.selectionrefs[i], node && node.graphNode.guid);
                    } else if (this.selectionrefs[i].indexOf("/") > -1) {
                        var patharr = this.selectionrefs[i].split("/");
                        var refentity = patharr[patharr.length - 1];
                        if (refentity.indexOf(node.graphNode.type) > -1) {
                            Commons.store(this.getContextObject(), this.selectionrefs[i], node && node.graphNode.guid);
                        }
                    }
                }
            }
        },

        saveAndFireSelection: function (item) {
            logger.debug("TreeView.widget.TreeView.saveAndFireSelection");

            mx.data.commit({
                mxobj: this.getContextObject(),
                callback: this.onSelect,
                error: this.showError
            }, this);

            this.onSelect(item);
        },

        getSelection: function (allowEdge) {
            logger.debug("TreeView.widget.TreeView.getSelection");

            if (this._selection && this._selection.isEdge && !allowEdge) {
                return this._selection.parent;
            }
            return this._selection;
        },

        hasSelection: function () {
            logger.debug("TreeView.widget.TreeView.hasSelection");

            return this.getSelection(false) != null;
        },

        hasMultiSelection: function () {
            logger.debug("TreeView.widget.TreeView.hasMultiSelection");

            return false;
        },

        withSelection: function (scope, cb) {
            logger.debug("TreeView.widget.TreeView.withSelection");

            if (this.hasSelection()) {
                cb.call(scope, this.getSelection(false));
            }
        },

        onSelect: function (selection) {
            //stub method to connect events to
        },

        onDefaultAction: function (selection) {
            //stub, this method is invoked when a row is doubleclicked/ return is pressed
        },

        findOrCreateEdge: function (type, parent, child, owner, nocreate) {
            logger.debug("TreeView.widget.TreeView.findOrCreateEdge");

            if (!child) {
                throw this.id + "  assertion failed: no child to find or create edge provided. Has it been free-ed somehow?";
            }

            if (!(parent.guid in this.edgesByParent)) {
                this.edgesByParent[parent.guid] = [];
            }
            if (!this.edgesByParent[parent.guid][type.index]) {
                this.edgesByParent[parent.guid][type.index] = {};
            }

            var place = this.edgesByParent[parent.guid][type.index];

            if (child.guid in place) {
                return place[child.guid];
            } else if (nocreate === true) {
                return null;
            } else {
                var edge = new Edge(type, parent, child, owner);

                //update edgesByParent
                this.edgesByParent[parent.guid][type.index][child.guid] = edge;

                //update edgesByOwner
                if (!(owner.guid in this.edgesByOwner)) {
                    this.edgesByOwner[owner.guid] = [];
                }
                if (!this.edgesByOwner[owner.guid][type.index]) {
                    this.edgesByOwner[owner.guid][type.index] = [];
                }

                this.edgesByOwner[owner.guid][type.index].push(edge);

                return edge;
            }
        },

        freeEdge: function (edge) {
            logger.debug("TreeView.widget.TreeView.freeEdge");

            //update edgesByParent
            if (edge.parent.guid in this.edgesByParent) {
                delete this.edgesByParent[edge.parent.guid][edge.type.index][edge.child.guid];
            }

            //update edgesByOwner
            if (edge.owner.guid in this.edgesByOwner) {
                var idx = dojo.indexOf(this.edgesByOwner[edge.owner.guid][edge.type.index], edge);
                this.edgesByOwner[edge.owner.guid][edge.type.index].splice(idx, 1);
            }
        },

        getXsettings: function (entity) {
            logger.debug("TreeView.widget.TreeView.getXsettings");

            var meta = mx.meta.getEntity(entity);
            for (var i = 0, x = null; x = this.xsettings[i]; i++) {
                if (meta.isA(x.xentity)) {
                    return x;
                }
            }
            return this.configError("TreeView config error: No Entity settings found for type: " + entity);
        },

        getEdgesOwnedBy: function (owner) {
            logger.debug("TreeView.widget.TreeView.getEdgesOwnedBy");

            if (!(owner.guid in this.edgesByOwner)) { //might not be available yet
                this.edgesByOwner[owner.guid] = [];
            }

            return this.edgesByOwner[owner.guid];
        },

        getChildEdges: function (parent) {
            logger.debug("TreeView.widget.TreeView.getChildEdges");

            if (!(parent.guid in this.edgesByParent))
                this.edgesByParent[parent.guid] = [];

            return this.edgesByParent[parent.guid];
        },

        selectFirstItem: function () {
            logger.debug("TreeView.widget.TreeView.selectFirstItem");

            if (!this.hiderootnode) {
                if (this.root && this.root.nodes.length > 0) {
                    this.setSelection(this.root.nodes[0]);
                }
            } else { //select first child
                var edges = this.root.getChildTypes();
                if (edges.length > 0) {
                    var edge = edges[0];
                    this.root.ensureChildren(edge, lang.hitch(this, function () {
                        var firstRefChildren = this.root.nodes[0].children[edge.index].children;
                        if (firstRefChildren.length > 0) {
                            this.setSelection(firstRefChildren[0]);
                        }
                    }));
                }
            }
        },

        processData: function (data) {
            logger.debug("TreeView.widget.TreeView.processData");

            for (var i = 0; i < data.length; i++) {
                var mxobj = data[i];
                var guid = mxobj.getGuid();
                if (this.dict[guid]) {
                    this.dict[guid].update(mxobj);
                } else {
                    var g = new GraphNode(this, mxobj, false);
                    if (this._recordSelectionSuggestion) {
                        if (!this._selectionSuggestions) {
                            this._selectionSuggestions = [g];
                        } else {
                            this._selectionSuggestions.push(g);
                        }
                    }
                }
                //TODO: pass index along to the appropriate edges...
            }
        },

        processRecordSelectionSuggestion: function () {
            logger.debug("TreeView.widget.TreeView.processRecordSelectionSuggestion");

            var max = 0,
                cur = null;
            if (this._selectionSuggestions) {
                //find the newest item from the suggestions
                for (var i = 0, g = null; g = this._selectionSuggestions[i++];) {
                    var b = g._data.get("changedDate");
                    if (b > max) {
                        max = b;
                        cur = g;
                    }
                }

                //expand it
                if (cur) {
                    var self = this;
                    cur.forNodes(function (node) {
                        if (node.parent == self.getSelection()) {
                            //expand parent first
                            node.parent.setCollapsed(false, function () {
                                //expand wrapper if needed
                                node.getEdge().setCollapsed(false);
                                self.setSelection(node);
                            });
                        }
                    });
                }
            }
            delete this._selectionSuggestions;
            delete this._recordSelectionSuggestion;
        },

        /*
         UI Events
        */

        grabFocus: function () {
            logger.debug("TreeView.widget.TreeView.grabFocus");

            if (mxui.wm && mxui.wm.focus && mxui.wm.focus.get && mxui.wm.focus.get() != this.treeNode) {
                mxui.wm.focus.put(this.treeNode);
            }
        },

        _setupEvents: function () {
            logger.debug("TreeView.widget.TreeView._setupEvents");

            var lc = Commons.liveConnect;

            lc(this, this.treeNode, "onclick", {
                "gg_assocfold": this.assocFoldClick,
                "gg_nodefold": this.foldNodeClick,
                "gg_column_wrapper": this.columnClick,
                "gg_node": function (node, e) {
                    this.grabFocus();

                    this.setSelection(mxui.dom.data(node, "ggdata"));

                    //expand if a row is clicked somewhere (but avoid folding twice if foldnode is clicked)
                    if (this.expandmode == "row" && !dojo.hasClass(e.target, "gg_nodefold")) {
                        this.foldNodeClick(node);
                    }
                }
            });

            lc(this, this.treeNode, "ondblclick", {
                "gg_node": function (target, e) {
                    if (!(dojo.hasClass(e.target, "gg_fold"))) //do not handle doubleclicks on fold nodes //TODO:nor clickables?
                        this.invokeDefaultAction(target, e);
                }
            });
            lc(this, this.treeNode, "mouseleave", {
                "gg_assoc_wrapper": function (target, e) {
                    dojo.removeClass(target, "gg_row_hover");
                    this._hoveredRow = null;
                    return true;
                },
                "gg_column_wrapper": function (target, e) {
                    dojo.removeClass(target, "gg_col_hover");
                    this.hoveredCol = null;
                    return true;
                },
                "gg_node": function (target, e) {
                    dojo.removeClass(target, "gg_row_hover");
                    this._hoveredRow = null;
                    return true;
                }
            });
            lc(this, this.treeNode, "onmouseover", {
                "gg_column_wrapper": function (target, e) {
                    if (!this.dnd.isdragging && target != this._hoveredCol) {
                        if (this.hoveredCol) {
                            dojo.removeClass(this.hoveredCol, "gg_col_hover");
                        }
                        dojo.addClass(target, "gg_col_hover");
                        this.hoveredCol = target;
                    }
                    return true;
                },
                "gg_fold": function (target, e) {
                    dojo.addClass(target.parentNode, "gg_fold_hover");
                    return true;
                },
                "gg_node": this.onRowMouseOver,
                "gg_children": function (_, e) {
                    //if (this.dnd.isdragging)
                    dojo.stopEvent(e);
                    return false; //avoid bubbling if dragging between items;
                }
            });

            lc(this, this.treeNode, "onmouseout", {
                "gg_fold": function (target, e) {
                    dojo.removeClass(target.parentNode, "gg_fold_hover");
                    return true;
                }
            });

            lc(this, this.treeNode, "onmousedown", {
                "gg_node": this.onRowMouseDown
            });

            lc(this, this.treeNode, "onmouseup", {
                "gg_node": this.onRowMouseUp
            });

            this.connect(this.treeNode, "onkeypress", this.keypress);

            if (this.expandmode == "accordion") {
                dojo.connect(this, "onSelect", this.updateAccordionForSelection);
            }
        },

        _getRenderNodeForNode: function (node) {
            logger.debug("TreeView.widget.TreeView._getRenderNodeForNode");

            while (node != null) {
                if (dojo.hasClass(node, "gg_node")) {
                    if (node == this.dnd.tmpnode) {
                        return this.dnd.target;
                    }
                    return mxui.dom.data(node, "ggdata");
                }
                node = node.parentNode;
            }

            return null;
        },

        keypress: function (e) {
            logger.debug("TreeView.widget.TreeView.keypress");

            var sel = this.getSelection(true),
                handled = false;
            if (sel) {
                handled = true;
                switch (e.keyCode) {
                    case dojo.keys.ENTER:
                        this.invokeDefaultAction();
                        break;
                    case dojo.keys.DOWN_ARROW:
                        if (e.ctrlKey == true) {
                            //TODO: swap
                        } else {
                            //next one is a child
                            var fc = this._getRenderNodeForNode(this.findNextNode(sel.domNode, "gg_node", this.treeNode));

                            if (fc != null) {
                                this.setSelection(fc);
                            }
                        }
                        break;
                    case dojo.keys.UP_ARROW:
                        if (e.ctrlKey == true) {
                            //TODO: swap
                        } else {
                            var prev = this._getRenderNodeForNode(this.findPreviousNode(sel.domNode, "gg_node", this.treeNode));
                            if (prev) {
                                this.setSelection(prev);
                            }
                        }
                        break;
                    case dojo.keys.LEFT_ARROW:
                        if (e.ctrlKey == false) {
                            if (!sel.collapsed) {
                                sel.setCollapsed(true);
                            } else if (sel.getVisibleParent()) {
                                this.setSelection(sel.getVisibleParent());
                            }
                        } else {
                            this.itemIndent(this.getSelection(), true); //TODO:
                        }
                        break;
                    case dojo.keys.RIGHT_ARROW:
                        if (e.ctrlKey == false) {
                            if (sel.collapsed) {
                                sel.setCollapsed(false);
                            } else {
                                var fs = this._getRenderNodeForNode(this.findNextNode(sel.domNode, "gg_node", this.treeNode));
                                if (fs)
                                    this.setSelection(fs);
                            }
                        } else {
                            this.itemIndent(this.getSelection(), false); //TODO
                        }
                        break;
                    default:
                        if (e.charCode == dojo.keys.SPACE) {
                            sel.setCollapsed(!sel.collapsed);
                        } else {
                            handled = false;
                        }
                        break;
                }
            }
            if (handled) {
                dojo.stopEvent(e);
            }
        },

        invokeDefaultAction: function () {
            logger.debug("TreeView.widget.TreeView.invokeDefaultAction");

            for (var i = 0, a = null; a = this.actions[i++];) {
                if (a.actisdefault && a.appliesToSelection()) {
                    a.invokeOnSelection();
                }
            }
        },

        onRowMouseOver: function (target, e) {
            if (!this.dnd.isdragging && target != this._hoveredRow) {
                this._hoveredRow && dojo.removeClass(this._hoveredRow, "gg_row_hover");
                dojo.addClass(target, "gg_row_hover");
                this._hoveredRow = target;
            }

            if (!this.dnd.isdragging && this.useDnd && this.dnd.mousedown) {
                if (this.dnd.startNode == target
                    && (Math.abs(e.pageX - this.dnd.startX) > 1 //NaN > 5 === false, so thats ok
                        || Math.abs(e.pageY - this.dnd.startY) > 1
                    )) {
                    this.startDrag(target, e);
                }
            } else if (this.dnd.isdragging) {
                this.onDrag(target, e);
            }
            e.preventDefault();
            dojo.stopEvent(e);
            return false; //stop further events
        },

        onRowMouseDown: function (target, e) {
            if (!this.dnd.isdragging) {
                this.dnd.mousedown = true;
                this.dnd.startNode = target;
                this.dnd.startX = e.pageX;
                this.dnd.startY = e.pageY;
            }
            e.preventDefault();
            return false;
        },

        onRowMouseUp: function (target, e) {
            this.dnd.mousedown = false;
            if (this.dnd.isdragging) {
                this.onEndDrag(target, e);
            }
            return false;
        },

        resetDndClasses: function (node) {
            logger.debug("TreeView.widget.TreeView.resetDndClasses");

            if (node) {
                dojo.removeClass(node, "gg_drag_over gg_drag_accept gg_drag_deny");
            }
        },

        startDrag: function (target, e) {
            logger.debug("TreeView.widget.TreeView.startDrag");

            //tmp node for drag an drop operations
            this.dnd.tmpnode = mxui.dom.create("li", { "class": "gg_node gg_anchor" }, mxui.dom.create("div", { "class": "gg_anchor_inner" }));

            var current = this.dnd.current = this._getRenderNodeForNode(target);
            this.setSelection(current);

            //if this item does not support DnD, go on as usual
            if (current.isEdge || current.isRoot || !current.type.allowdnd) {
                return false;
            }

            var avatar = this.dnd.avatar = mxui.dom.create("div", { "class": "gg_avatar" }, dojo.clone(current.rowNode)); //TODO: make beter avatar

            //hooray, we can start thedrag
            //		console.log("start drag");

            this.dnd.isdragging = true;
            this.dnd.beginBox = dojo.position(target);

            dojo.addClass(current.domNode, "gg_dragging");

            dojo.addClass(avatar, "gg_avatar");
            dojo.place(avatar, dojo.body(), "last");

            //update position
            domStyle.set(avatar, {
                "position": "absolute",
                "zIndex": 10000
            });

            this.dnd.bodyconnect = dojo.connect(dojo.body(), "onmouseup", lang.hitch(this, function () {
                this.onEndDrag();
            }));

            this.dnd.bodyconnect2 = dojo.connect(dojo.body(), "onmouseover", lang.hitch(this, function (e) {
                //console.log("mouse out");
                domStyle.set(this.dnd.avatar, {
                    "top": (e.pageY + 32) + "px",
                    "left": (e.pageX + 32) + "px"
                });

                if (this.dnd.target)
                    this.resetDndClasses(this.dnd.target.domNode);

                this.dnd.accept = false;
                this.dnd.target = null;

                dojo.addClass(this.dnd.avatar, "gg_drag_outside");
            }));

            return true;
        },

        onDrag: function (targetNode, e) {
            logger.debug("TreeView.widget.TreeView.onDrag");

            //Hide selection, especially needed in IE.
            if (document.selection && document.selection.empty) {
                document.selection.empty();
            } else if (window.getSelection) {
                var sel = window.getSelection();
                sel.removeAllRanges();
            }

            var prevtarget = this.dnd.target;
            var prevbefore = this.dnd.dropbefore;

            if (prevtarget) {
                this.resetDndClasses(prevtarget.domNode);
            }

            var current = this.dnd.current;
            var avatar = this.dnd.avatar;
            var mbox = dojo.marginBox(targetNode.children[0]); //take the first child, as the node itself might include the descendants
            var target = this.dnd.target = this._getRenderNodeForNode(targetNode);

            if (!target) {
                return;
            }

            var candropBefore = this.canDropBefore(current, target);
            var pos;
            var tmpnode = this.dnd.tmpnode;
            var copy = this.dnd.copy = e && e.ctrlKey;

            var oy = e.offsetY || e.layerY; //for FF compatiblity

            //drag over tmpnode
            if (targetNode == tmpnode) {
                pos = this.dnd.pos = this.dnd.tmppos;
            } else { //drag over a real node
                pos = this.dnd.pos = "last";
                if (candropBefore) {
                    if (oy > mbox.h / 2) {
                        if (target.collapsed == true || target.childNode.children.length == 0) {
                            this.dnd.tmppos = "after";
                            dojo.place(tmpnode, target.domNode, "after");
                        } else { //as first child
                            this.dnd.tmppos = "first";
                            dojo.place(tmpnode, target.childNode, "first");
                        }
                    } else {
                        this.dnd.tmppos = "before";
                        dojo.place(tmpnode, target.domNode, "before");
                    }
                }
            }

            var accept = this.dnd.accept = this.dragOver(current, target, pos, copy);

            this.resetDndClasses(target.domNode);
            this.resetDndClasses(tmpnode);
            dojo.removeClass(avatar, "gg_drag_outside");

            //update classes according to state
            if (copy) {
                dojo.addClass(avatar, "gg_drag_copy");
            } else {
                dojo.removeClass(avatar, "gg_drag_copy");
            }

            if (pos == "last") {
                dojo.addClass(target.domNode, "gg_drag_over");
                dojo.addClass(target.domNode, accept ? "gg_drag_accept" : "gg_drag_deny");
            } else {
                dojo.addClass(tmpnode, "gg_drag_over gg_drag_accept");
            }

            var acceptTmp = candropBefore && (pos != "last" || this.dragOver(current, target, this.dnd.tmppos, copy)); //is the tmppos allowed?
            domStyle.set(tmpnode, "display", acceptTmp ? "list-item" : "none");

            domStyle.set(avatar, {
                "top": (e.pageY + 32) + "px",
                "left": (e.pageX + 32) + "px"
            });

            //stop / start the expand timer
            //auto expand stuff
            if (prevtarget != target || pos != "last") {
                if (this.dnd.expandtimer) {
                    clearTimeout(this.dnd.expandtimer);
                    this.dnd.expandtimer = null;
                }
            } else if (pos == "last")
                if (!this.dnd.expandtimer) {
                    this.dnd.expandtimer = setTimeout(lang.hitch(this, function (toexpand) {
                        if (toexpand == this.dnd.target && this.dnd.pos == "last") { //still the same ?
                            toexpand.setCollapsed(false);
                            //if (this.dnd.tmpnode)
                            //	this.dnd.tmpnode.parentNode = null; //hide current tmpnode, mwe: disabled for now, parentNode = null breaks in IE
                        }
                    }, target), 500);
                }
        },

        onEndDrag: function (target, e) {
            logger.debug("TreeView.widget.TreeView.onEndDrag");

            var result = this.dnd.accept && this.performDrop(this.dnd.current, this.dnd.target, this.dnd.pos, this.dnd.copy);

            //update event state
            this.dnd.isdragging = false;
            this.dnd.mousedown = false;
            dojo.disconnect(this.dnd.bodyconnect);
            dojo.disconnect(this.dnd.bodyconnect2);

            //hide temporary nodes node
            domStyle.set(this.dnd.tmpnode, "display", "none");
            dojo.destroy(this.dnd.tmpnode);
            delete this.dnd.tmpnode;

            if (result) {
                this.resetNodesAfterDnD();
            } else { //revert, move the node back if cancelled
                dojo.animateProperty({
                    node: this.dnd.avatar,
                    properties: {
                        left: this.dnd.beginBox.x,
                        top: this.dnd.beginBox.y
                    },
                    duration: 500,
                    onEnd: lang.hitch(this, this.resetNodesAfterDnD)
                }).play();
            }
        },

        resetNodesAfterDnD: function () {
            logger.debug("TreeView.widget.TreeView.resetNodesAfterDnD");

            if (this.dnd.target) {
                this.resetDndClasses(this.dnd.target.domNode);
            }
            this.resetDndClasses(this.dnd.current.domNode);
            dojo.removeClass(this.dnd.current.domNode, "gg_dragging");

            dojo.destroy(this.dnd.avatar);
            delete this.dnd.avatar;
        },

        _findDropAssocs: function (item, target, pos, copy) {
            logger.debug("TreeView.widget.TreeView._findDropAssocs");

            var assocs = [];

            if (pos == "before" || pos == "after" || target.isEdge) {
                //the drop assocation is the association of the current target item, thats easy :)
                if (!target.isRoot && target.type.allowdnd
                    && (!copy || target.type.allowdndcopy)
                    && item.isA(target.type.entity))
                    assocs.push(target.type);
            } else {
                //return find assocition from target -> child with dnd
                for (var i = 0, a = null; a = this.types[i++];) {
                    if (a.allowdnd
                        && (!copy || a.allowdndcopy)
                        && item.isA(a.entity)
                        && target.isA(a.parententity)
                    ) {
                        assocs.push(a);
                    }
                }
            }
            return assocs;
        },

        //indicate whether it is possible to drop before another item
        canDropBefore: function (item, target) {
            logger.debug("TreeView.widget.TreeView.canDropBefore");

            if (!target || target.isEdge) //we cannot drop before assoc nodes
                return false;

            var e = item.graphNode.type;
            //use a cache
            if (!this.dnd.allowDropBefore) {
                this.dnd.allowDropBefore = {};
            }
            if (!(e in this.dnd.allowDropBefore)) {
                var x = item.graphNode.xsettings;
                this.dnd.allowDropBefore[e] = x && mx.meta.getEntity(e).getAttributeType(x.sortattr) == "Decimal";
            }
            return this.dnd.allowDropBefore[e];
        },

        /**
         * triggered when dragging item over target.
         * @param  {[type]} item   [description]
         * @param  {[type]} target [description]
         * @param  {[type]} before [description]
         * @return {[type]} Whether the item can be dropped here. Used for styling
         */
        dragOver: function (item, target, pos, copy) {
            logger.debug("TreeView.widget.TreeView.dragOver");

            //Avoid drop in self
            var validSelfdrop = (target == item && (pos == "before" || pos == "after"));

            if (!validSelfdrop) {
                var cur = target;
                while (cur != null) {
                    if (cur == item) {
                        return false;
                    }
                    cur = cur.parent;
                }
            }
            return this._findDropAssocs(item, target, pos, copy).length > 0;
        },

        /**
         * Drops an item on a target. Return true if the drop was accepted / succesful
         * The return value is used for styling purposes only (if false, a revert animation is playe).
         * The real data should be updated as a result of callbacks
         * @param  {[type]} item   [description]
         * @param  {[type]} target [description]
         * @param  {[type]} pos [description]
         * @return {[type]}
         */
        performDrop: function (item, target, pos, copy) {
            logger.debug("TreeView.widget.TreeView.performDrop");

            if (!target) {
                return false;
            }

            var assocs = this._findDropAssocs(item, target, pos, copy);
            var actions = []; //microflows to invoke to persist the changes

            var i = item.graphNode._data; //item
            var o = item.parent.graphNode._data; //old parent

            //determine drop target
            var t = null;
            if (target.isEdge) {
                t = target.parent.graphNode._data;
            } else if (pos == "before" || pos == "after") {
                t = target.parent.graphNode._data;
            } else {
                t = target.graphNode._data; //new parent
            }

            //0) always remove existing parent if not copy, regardless which association it was..
            if (!copy) {
                var assoc1 = item.type;
                if (assoc1.assoctype == "fromparent") {
                    if (assoc1.isRefset) {
                        o.removeReferences(assoc1.assoc, [i.getGuid()]);
                    }
                    else {
                        o.set(assoc1.assoc, "");
                    }
                    actions.push([assoc1.dropmf, o]); //otherwise o might never know that a child was removed
                }
                else { //from child
                    if (assoc1.isRefset) {
                        i.removeReferences(assoc1.assoc, [o.getGuid()]);
                    } else {
                        i.set(assoc1.assoc, "");
                    }

                    //actions.push([assoc.dropmf, i]); //MWE: I guess this is not needed, since a drop mf is most likely already fired for i, and this might confuse the logic.
                }
            }

            //1) update new parent
            for (var k = 0, assoc = null; assoc = assocs[k++];) {
                //assoc stored in parent
                if (assoc.assoctype == "fromparent") {
                    actions.push([assoc.dropmf, t]);

                    //reference set (was already removed from orig parent in step 0)
                    if (assoc.isRefset) {
                        t.addReferences(assoc.assoc, [i.getGuid()]);
                    } else { //normal reference
                        t.set(assoc.assoc, i.getGuid());
                    }
                } else { //assoc stored in child
                    actions.push([assoc.dropmf, i]);

                    if (assoc.isRefset) {
                        i.addReferences(assoc.assoc, [t.getGuid()]);
                    } else {
                        i.set(assoc.assoc, t.getGuid()); //copy is not supported, dont bother
                    }
                }
            }

            //2) update position. Note that this position applies to all assocs! which is a bit weird...
            var x = item.graphNode.xsettings;
            if (x && mx.meta.getEntity(item.graphNode.type).getAttributeType(x.sortattr) == "Decimal") {
                var nidx;
                if (pos == "before" || pos == "after") {
                    //find the other related element for drop in between
                    var othernode = pos == "before" ? target.domNode.previousElementSibling : target.domNode.nextElementSibling;
                    if (this.dnd.tmpnode != null && othernode == this.dnd.tmpnode) {
                        othernode = pos == "before" ? othernode.previousElementSibling : othernode.nextElementSibling;
                    }
                    var other = this._getRenderNodeForNode(othernode);

                    if (other == null || other.isEdge) { //either first or last
                        nidx = target.graphNode.getSortIndex() + (pos == "before" ? -1024 : 32354);
                    } else { //put between
                        nidx = (target.graphNode.getSortIndex() + other.graphNode.getSortIndex()) / 2;
                    }
                } else {
                    if (pos == "last") {
                        nidx = (target.isEdge ? target.parent : target).findMaxIndex() + 14056;
                    } else {
                        nidx = (target.isEdge ? target.parent : target).findMinIndex() - 4313;
                    }
                }

                if (isNaN(nidx)) {
                    nidx = 0; //probably div by zero
                }

                item.graphNode._data.set(x.sortattr, nidx);
            }

            //3) loop items in actions, store the changes and invoke the microflows
            var left = actions.length;
            var gn = item.graphNode;
            //TODO: check whether ar doesn"t have double items?
            for (var l = 0, ar = null; ar = actions[l++];) {
                Commons.mf(ar[0], ar[1], function () {

                    //when all mf"s have fired, find the best node to select
                    left -= 1;
                    if (left == 0) {
                        //find the best node to animate
                        var bestnode = null;
                        gn.forNodes(function (node) {
                            if (bestnode == null || node.parent == target || node.parent == target.parent) {
                                bestnode = node;
                            }
                        });

                        if (bestnode) {
                            this.setSelection(bestnode);
                        }
                    }
                }, this);
            }

            return true;
        },

        foldNodeClick: function (node) {
            logger.debug("TreeView.widget.TreeView.foldNodeClick");

            var renderNode = this._getRenderNodeForNode(node);
            renderNode.setCollapsed(!renderNode.collapsed);
        },

        updateAccordionForSelection: function (record) {
            logger.debug("TreeView.widget.TreeView.updateAccordionForSelection");

            if (!record) {
                return;
            }
            record.setCollapsed(false);

            var c = record;
            var p = record.getVisibleParent();
            while (p != null) {
                dojo.forEach(p.children, function (assoc) {
                    if (assoc) dojo.forEach(assoc.children, function (child) {
                        if (child != c) {
                            child.setCollapsed(true);
                        }
                    });
                });
                c = p;
                p = p.getVisibleParent();
            }
        },

        assocFoldClick: function (node) {
            logger.debug("TreeView.widget.TreeView.assocFoldClick");

            var renderEdge = mxui.dom.data(node.parentNode.parentNode, "ggdata");
            renderEdge.setCollapsed(!renderEdge.collapsed);
        },

        columnClick: function (node) {
            logger.debug("TreeView.widget.TreeView.columnClick");

            var col = mxui.dom.data(node, "colindex");
            var renderNode = this._getRenderNodeForNode(node);

            this.columns[col].invokeAction(renderNode);
        },

        addToSchema: function (entity, attr) {
            logger.debug("TreeView.widget.TreeView.addToSchema");

            if (!attr) {
                return;
            }

            var t = this.getXsettings(entity);
            if (attr.indexOf("/") > -1) {
                if (!t) {
                    this.configError("Attribute " + attr + " refers to unconfigured type " + entity);
                }

                var parts = attr.split("/");

                if (!(parts[0] in t.filter.references)) {
                    t.filter.references[parts[0]] = { attributes: [] };
                }

                if (parts.length > 2) {
                    t.filter.references[parts[0]].attributes.push(parts[2]);
                }

            } else {
                t.filter.attributes.push(attr);
            }
        },

        /**
         converts Mx reference data to a map with guids. The data can either be an array of guids, empty string or an object
         */
        toMap: function (thing) {
            logger.debug("TreeView.widget.TreeView.toMap");

            var res = {};
            if (thing == "") {
                return res;
            }
            if (dojo.isArray(thing)) {
                dojo.forEach(thing, function (guid) {
                    res[guid] = true;
                });
                return res;
            }
            if (dojo.isObject(thing)) {
                if (thing.guid)
                    res[thing.guid] = true;
                else
                    return thing;
            }
            //a guid
            res[thing] = true;
            return res;
        },

        /**
         * moves the domNode within the parent to the designated position. Precondition: domNode.parentNode
         * @param  {[type]} domNode     [description]
         * @param  {[type]} targetIndex [description]
         */
        moveNode: function (domNode, targetIndex) {
            logger.debug("TreeView.widget.TreeView.moveNode");

            var parent = domNode.parentNode;

            if (parent == null) {
                throw "tree.moveNode: domNode has no parent";
            }

            dojo.place(domNode, parent, targetIndex);
        },

        /**
         * find treewise the previous node preceding the startnode
         * @param  {[type]} clazz     [description]
         * @param  {[type]} limitNode [description]
         * @return {[type]}
         */
        findPreviousNode: function (node, clazz, limitNode) {
            logger.debug("TreeView.widget.TreeView.findPreviousNode");

            if (node.previousElementSibling == null) {
                //find a matching parent
                var cur = node.parentNode;
                while (cur != null && cur != limitNode) {
                    if (dojo.hasClass(cur, clazz)) {
                        return cur;
                    }
                    cur = cur.parentNode;
                }
            } else {
                //find a previously matching sibling
                var findLast = function (cur) {
                    for (var i = cur.children.length - 1; i >= 0; i--) {
                        if (domStyle.set(cur.children[i], "display") == "none") {
                            continue;
                        }
                        var l = findLast(cur.children[i]);
                        if (l != null) {
                            return l;
                        }
                    }

                    if (dojo.hasClass(cur, clazz)) {
                        return cur;
                    }
                    return null;
                };

                var lc = findLast(node.previousElementSibling);
                if (lc) {
                    return lc;
                }
                return this.findPreviousNode(node.previousElementSibling, clazz, limitNode);
            }
            return null;
        },

        findNextNode: function (node, clazz, limitNode) {
            logger.debug("TreeView.widget.TreeView.findNextNode");

            var findChild = function (cur) {
                for (var i = 0; i < cur.children.length; i++) {
                    if (domStyle.set(cur.children[i], "display") != "none") {
                        if (dojo.hasClass(cur.children[i], clazz)) {
                            return cur.children[i];
                        }
                        var fc = findChild(cur.children[i]);
                        if (fc) {
                            return fc;
                        }
                    }
                }
                return null;
            };

            var fc = findChild(node);
            if (fc) {
                return fc;
            }

            var cur = node;
            while (cur != limitNode && cur != null) {
                var n = cur.nextElementSibling;
                if (n != null && dojo.hasClass(n, clazz) && domStyle.set(n, "display") != "none") {
                    return n;
                }
                cur = cur.parentNode;
            }

            return null;
        },

        configError: function (msg) {
            logger.debug("TreeView.widget.TreeView.configError");

            Commons.configError(this, msg);
        },

        showError: function (e) {
            logger.debug("TreeView.widget.TreeView.showError");

            Commons.error(e, this);
        },

        splitPropsTo: function (props, target) {
            logger.debug("TreeView.widget.TreeView.splitPropsTo");

            Commons.splitPropsTo(this, props, target);
        },

        close: function () {
            this.disposeContent();
        }
    });
});
