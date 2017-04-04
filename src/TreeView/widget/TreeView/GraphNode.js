/**
 * Graphnode refers to an single instance of an object. Edges are not stored here, but globally in the tree.
 * A single graphnode might have multiple render nodes, for every time it is viewed in the tree.
 */
define([
    "dojo/_base/declare",
    "TreeView/widget/TreeView/RenderNode"
], function(declare, RenderNode) {
    "use strict";

    return declare("TreeView.widget.TreeView.GraphNode", null, {
        nodes: null, //correspinding render nodes
        tree: null,
        guid: null,
        type: "",
        children: null, //stores the state of child edges per type

        _data: null,
        _refs: 0, //number of parents referring to this node, if zero, free
        _burst: null,
        _subscription: null,

        constructor: function (tree, data, asRoot) {
            logger.debug("TreeView.widget.GraphNode.constructor");
            this.guid = data.getGuid();
            tree.dict[this.guid] = this;
            this.type = data.getEntity();
            this._data = data;

            this.tree = tree;
            this.xsettings = this.tree.getXsettings(this.type);
            this.nodes = [];

            //store childtypes
            this.children = [];

            var ar = this.getChildTypes();
            for (var i = 0; i < ar.length; i++) {
                this.children[ar[i].index] = {
                    knowsChildren: false,
                    type: ar[i],
                    //householding for retrieving children
                    _afterChildrenCb: null,
                    _retrieving: false
                };
            }

            this.update(data);

            this._subscription = mx.data.subscribe({
                guid: this.guid,
                callback: dojo.hitch(this, function (thing) {
                    if (dojo.isObject(thing)){
                        this.updateWithRefs(thing);
                    }else{
                        mx.data.get({
                            guid: thing,
                            error: this.tree.showError,
                            callback: dojo.hitch(this, this.updateWithRefs)
                        });
                    }
                })
            });

            if (asRoot == true) {
                this.tree.root = this;
                this._refs += 1; //additional ref for roots, to not accidentaly free them.
                //place the node
                var n = new RenderNode(this, null, null); //root has no assoctype associated...
            }
        },

        /** convenient helper method */
        isA: function (type) {
            //logger.debug("TreeView.widget.GraphNode.isA");
            return this._data.isA(type);
        },

        getSortIndex: function () {
            logger.debug("TreeView.widget.GraphNode.getSortIndex");
            if (this.xsettings)
                return parseInt(this._data.get(this.xsettings.sortattr), 10);
            return -1;
        },

        updateWithRefs: function (data) {
            logger.debug("TreeView.widget.GraphNode.updateWithRefs");
            this.update(data);
            this.updateEdges();
        },

        update: function (data) {
            logger.debug("TreeView.widget.GraphNode.update");
            this._data = data;

            this.checkBurst();

            //redraw content data
            this.forNodes(function (node) {
                node.draw();
            });
        },

        updateEdges: function () {
            logger.debug("TreeView.widget.GraphNode.updateEdges");
            var data = this._data;
            //1. mark edges stored in here invalid
            var owningEdges = this.tree.getEdgesOwnedBy(this);

            dojo.forEach(owningEdges, function (edgeSet) {
                if (edgeSet)
                    dojo.forEach(edgeSet, function (edge) {
                        edge._valid = false;
                    });
            });

            //2. update edges owned by this object
            for (var i = 0; i < this.tree.types.length; i++) {
                var type = this.tree.types[i];
                if (data.isA(type.ownerentity)) {

                    var rawdata = data.get(type.assoc);
                    var ids = this.tree.toMap(rawdata);
                    var unknown = [];

                    for (var id in ids) {
                        var other = this.tree.dict[id];

                        var isChild = type.assoctype == "fromchild";
                        if (other == null) {
                            //2a. handle unknown "other side"
                            if (isChild) //skip parents not available in the tree
                                continue;
                            else {
                                unknown.push(id);
                            }
                        }

                        if (other != null) {

                            //Pre 2b: special case, if the type has a constraint and a cache burst,
                            //we are not sure that the currently updated object passes the constraint, so rely on the cacheburst to show this item in that parent
                            //if we are not loading exactly that relation, do not automatically create that edge
                            //
                            //see _retrieveChildrenCore for more about the _currentLoadingRel flag.
                            var nocreate = false;
                            if (type != this.tree._currentLoadingRel && isChild && type.constraint.length) {
                                var xsettings = this.tree.getXsettings(type.parententity)
                                if (xsettings != null && xsettings.xburstattr){
                                    nocreate = true;
                                }
                            }

                            //2b. ..find or create edge, mark valid
                            var edge = this.tree.findOrCreateEdge(type, isChild ? other : this, isChild ? this : other, this, nocreate);
                            if (edge)
                                edge._valid = true;
                        }
                    }

                    //3. fetch the associations from this to child which are not known yet
                    this._fetchUnknownChildrenHelper(type, unknown);
                }
            }

            //4. remove invalid edges
            dojo.forEach(owningEdges, function (arr) {
                if (arr)
                    for (var i = arr.length - 1; i >= 0; i--) //MWE: count down, items might be free-ed on the fly
                        if (!arr[i]._valid)
                            arr[i].free();
            });
        },

        /**
         * check whethers a burst attribute, as defined in the childtypes, has changed. If so, invalidate children
         * TODO: move childeges to children
         */
        checkBurst: function () {
            logger.debug("TreeView.widget.GraphNode.checkBurst");
            var x = this.xsettings;
            if (x != null && x.xburstattr) {
                var newburst = this._data.get(x.xburstattr);
                if (newburst != this._burst) {
                    this._burst = newburst;
                    dojo.forEach(this.children, function (edgeSet) {
                        if (edgeSet){
                            edgeSet.knowsChildren = false;
                        }
                    });

                    this.forNodes(function (node) {
                        if (node.collapsed == false || node == this.tree.getSelection()) { //re-draw / fetch expanded nodes

                            //re-expand all assocs in the node
                            dojo.forEach(node.children, function (re) {
                                if (re && re.collapsed == false) {
                                    re.collapsed = true;
                                    re.setCollapsed(false, function () {
                                        node.tree.processRecordSelectionSuggestion();
                                    });
                                }
                            });
                        }
                    });
                }
            }
        },

        forNodes: function (func) {
            logger.debug("TreeView.widget.GraphNode.forNodes");
            var l = this.nodes.length;
            for (var i = 0; i < l; i++){
                func.call(this, this.nodes[i]);
            }
        },

        /**
         * returns all types which can be a child of this node (independent of owner)
         * @return {[type]}
         */
        getChildTypes: function () {
            logger.debug("TreeView.widget.GraphNode.getChildTypes");
            var res = [];
            for (var i = 0; i < this.tree.types.length; i++) {
                var type = this.tree.types[i];

                if (this.isA(type.parententity))
                    res.push(type);
            }
            return res;
        },

        //if a ref(set) was changed, and it refers to unknown ids, fetch them.
        _fetchUnknownChildrenHelper: function (type, guids) {
            logger.debug("TreeView.widget.GraphNode._fetchUnknownChildrenHelper");
            var xpath;
            if (guids.length == 0) { //no guids
                return;
            }
            if (!this.children[type.index].knowsChildren) {//never expanded, we need to fetch anyway on the next expand, and the edges will be created by the retrieve. Skip for now
                return;
            }

            var args = {
                xpath: xpath,
                filter: type.filter,
                callback: dojo.hitch(this, function (data) {
                    this.tree.processData(data); //data should always be one (or zero if not in constraint)

                    for (var i = 0; i < data.length; i++) { //create the assocations
                        var e = this.tree.findOrCreateEdge(type, this, this.tree.dict[data[i].getGuid()], this);
                        e._valid = true;
                    }
                }),
                error: this.tree.showError
            };

            //Question: should the constraint be applied?
            //- Yes: that is more consistent.
            //- No: allows for unsaved objects to be shown in the tree if added to the parent
            //Current implementation: yes if a constraint is used, otherwise, guids is used

            if (type.constraint) {
                xpath = "//" + type.entity + "[id=\"" + guids.join("\" or id=\"").substring(5) + "\"]" + type.constraint;
                args.xpath = xpath.replace(/\[\%CurrentObject\%\]/gi, this.tree.root.guid);
            } else {
                args.guids = guids;
            }

            mx.data.get(args);
        },

        ensureChildren: function (type, callback) {
            logger.debug("TreeView.widget.GraphNode.ensureChildren");
            var c = this.children[type.index];
            if (c.knowsChildren) {
                if (callback && typeof callback === "function") { callback(); }
            } else if (c._retrieving) {
                if (callback) {
                     c._afterChildrenCb.push(callback);
                }
            } else {
                c._retrieving = true;
                c._afterChildrenCb = callback ? [callback] : []; //event chain

                this._retrieveChildrenCore(c, dojo.hitch(this, function () {
                    c._retrieving = false;
                    c.knowsChildren = true;

                    var f;
                    while (f = c._afterChildrenCb.shift()) {
                        f();
                    }
                }));
            }
        },

        _retrieveChildrenCore: function (c, callback) {
            logger.debug("TreeView.widget.GraphNode._retrieveChildrenCore");
            var type = c.type;

            //self references leaving from the parent need a recursive constraint
            var reverse = type.recursive && type.assoctype == "fromparent" ? "[reversed()]" : "";
            var xpath = "//" + type.entity + "[" + type.assoc + reverse + " = \"" + this.guid + "\"]" + (type.constraint ? type.constraint : "");
            xpath = xpath.replace(/\[\%CurrentObject\%\]/gi, this.tree.root.guid);

            var kwargs = {
                xpath: xpath,
                filter: this.tree.getXsettings(type.entity).filter,
                callback: dojo.hitch(this, function (rel, data) {

                    //1. mark edges from here in here invalid
                    var edges = this.tree.getChildEdges(this)[rel.index];
                    for (var childguid in edges){
                        edges[childguid]._valid = false;
                    }

                    try {
                        //if a cacheburst is used, child to parent edgets are not created automatically to avoid byposing constraints.
                        //however, here, we now that the constraint is allowed to be bypassed since we are loading exactly that relation
                        //store this in flag.
                        this.tree._currentLoadingRel = rel;
                        this.tree.processData(data);
                    }
                    finally {
                        delete this._currentLoadingRel;
                    }

                    //3. create the edge if from parent, update index, update valid state
                    for (var i = 0; i < data.length; i++) {
                        var guid = data[i].getGuid();
                        var child = this.tree.dict[guid];

                        var edge =
                            type.assoctype == "fromparent"
                                //3a. if this object is the owner of the association, the edges are not created automatically by process data, create them now
                                ? this.tree.findOrCreateEdge(type, this, child, this)
                                //3b. otherise, still retrieve the edge to update the index if necessary
                                : this.tree.findOrCreateEdge(type, this, child, child);

                        edge.updateIndex(i);

                        //we now for sure it is valid now
                        edge._valid = true;
                    }

                    //4. remove invalid children after receiving all data (no need to refetch them)
                    for (var childguid2 in edges)
                        if (!edges[childguid2]._valid)
                            edges[childguid2].free();

                    callback(); //wait with callback until all requests are completed
                }, type),
                error: this.tree.showError
            };

            var xsettings = this.tree.getXsettings(type.entity);

            if (!kwargs.filter) {
                kwargs.filter = {};
            }

            if (xsettings != null) {
                kwargs.filter.sort = [[xsettings.sortattr, xsettings.sortdir]];
            }

            //perform the get
            mx.data.get(kwargs);
        },


        free: function () {
            logger.debug("TreeView.widget.GraphNode.free");
            this._refs -= 1;

            if (this._refs <= 0) {
                if (this._destroyed)
                    return;
                this._destroyed = true;

                if (this._subscription)
                    mx.data.unsubscribe(this._subscription);

                delete this.tree.dict[this.guid];

                this.forNodes(function (node) {
                    node.free();
                });

                //Question: which edges should be freed here?
                //Answer: only the owning ones. Non owning ones should be freed as a result of refreshes of their objects
                var owningEdges = this.tree.getEdgesOwnedBy(this);
                dojo.forEach(owningEdges, function (ar) {
                    if (ar)
                        for (var i = ar.length - 1; i >= 0; i--)
                            ar[i].free();
                });

                delete this.tree.edgesByParent[this.guid];
                delete this.tree.edgesByOwner[this.guid];
            }
        }
    });
});
