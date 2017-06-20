//A Node in the rendering
define([
    "dojo/_base/declare",
    "TreeView/widget/TreeView/RenderEdge"
], function (declare, RenderEdge) {
    "use strict";

    return declare("TreeView.widget.TreeView.RenderNode", null, {
        graphNode: null, //correspoding graphnode
        children: null, //list of renderEdges
        domNode: null,
        rowNode: null,
        dataNode: null, //rendered node
        childNode: null, //node to place children in
        parent: null, //rendernode
        type: null, //the assoc for which this item was rendered
        tree: null,
        depth: 0,
        collapsed: null,
        index: -1,
        _colNodes: null, //array with columnNodes
        canHazChildren: true,
        isEdge: false,
        hasVisibleEdge: false, //true if there is an always visible association edge.

        constructor: function (graphNode, parentRenderNode, type) {
            logger.debug("TreeView.widget.TreeView.RenderNode.constructor");
            this.graphNode = graphNode;
            this.parent = parentRenderNode;
            this.isRoot = this.parent === null;
            this.children = [];
            this.type = type;
            this.tree = graphNode.tree;

            this.canHazChildren = this.graphNode.getChildTypes().length > 0;

            this.foldNode = mxui.dom.create("span", { "class": "gg_nodefold gg_fold " + (this.canHazChildren ? "gg_folded" : "gg_nofold") });
            this.dataNode = mxui.dom.create("span", {
                "class": "gg_data",
                "style": this.graphNode.xsettings.entitystyle
            });
            this.childNode = mxui.dom.create("ul", { "class": "gg_children" });
            this.rowNode = mxui.dom.create("div", { "class": "gg_row" }, this.foldNode, this.dataNode);
            this.domNode = mxui.dom.create("li", { "class": "gg_node " + this.graphNode.xsettings.entityclazz }, this.rowNode, this.childNode);

            mxui.dom.data(this.domNode, "ggdata", this);

            if (this.graphNode.getChildTypes().length > 0)
                dojo.addClass(this.domNode, "gg_canhazchildren");

            this._setupColumns();

            this.draw(true);

            this.setCollapsed(true);
            
            // set depth based on having a parent, root is 0, should be done before creating Rendering Edges.
            if (this.parent != null) {
                this.depth = this.parent.depth + 1;
            }

            //setup child edges
            dojo.forEach(this.graphNode.getChildTypes(), function (type) {
                this.children[type.index] = new RenderEdge(this, type);
                this.hasVisibleEdge |= type.showassocname;
            }, this);

            //root item
            if (this.parent == null) {
                dojo.place(this.domNode, this.tree.treeNode);
            }
            //place in parent
            else {
                this.getEdge().add(this);
            }

            graphNode.nodes.push(this);

            if (this.tree.expandall > this.depth) {
                this.setCollapsed(false);
            } else if (this.tree.prefetch){
                // Expand and collaps to prefetch all children
                this.setCollapsed(false); 
                this.setCollapsed(true);
            }

        },

        data: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.data");
            return this.graphNode._data;
        },

        getVisibleParent: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.getVisibleParent");
            if (this.parent == null) {
                return null;
            }

            var e = this.getEdge();
            if (e.visible) {
                return e;
            }
            return this.parent;
        },

        getEdge: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.getEdge");
            return this.parent.children[this.type.index];
        },

        /** convenient helper method */
        isA: function (type) {
            //logger.debug("TreeView.widget.TreeView.RenderNode.isA");
            return this.graphNode.isA(type);
        },

        getChildCount: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.getChildCount");
            var res = 0;
            dojo.forEach(this.children, function (edge) {
                if (edge) {
                    res += edge.children.length;
                }
            });
            return res;
        },

        updateFoldVisibility: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.updateFoldVisibility");
            if (this.foldNode) {
                if (!this.hasVisibleEdge && this.getChildCount() == 0) {
                    dojo.style(this.foldNode, "visibility", "hidden");
                } else {
                    dojo.style(this.foldNode, "visibility", "");
                }
            }
        },

        findMaxIndex: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.findMaxIndex");
            var max = -100000;
            dojo.forEach(this.children, function (edge) {
                if (edge) {
                    for (var j = 0, c = null; c = edge.children[j++];) {
                        max = Math.max(max, c.graphNode.getSortIndex());
                    }
                }
            });
            return max;
        },

        findMinIndex: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.findMinIndex");
            var min = 100000;
            dojo.forEach(this.children, function (edge) {
                if (edge) {
                    for (var j = 0, c = null; c = edge.children[j++];) {
                        min = Math.min(min, c.graphNode.getSortIndex());
                    }
                }
            });
            return min;
        },

        setCollapsed: function (newvalue, cb) {
            logger.debug("TreeView.widget.TreeView.RenderNode.setCollapsed");
            if (newvalue == this.collapsed) {
                cb && cb();
                return;
            }

            this.collapsed = newvalue;
            if (this.collapsed) {
                dojo.style(this.childNode, "display", "none"); //TODO: anim
                dojo.attr(this.foldNode, "class", "gg_nodefold gg_fold " + (this.canHazChildren ? "gg_folded" : "gg_nofold"));
                cb && cb();
            } else {
                dojo.attr(this.foldNode, "class", "gg_nodefold gg_fold gg_loading");

                var allChildrenCallback = dojo.hitch(this, function () {
                    if (!this.collapsed) { //user might have clicked collapse again
                        dojo.style(this.childNode, "display", "block"); //TODO: anim
                        dojo.attr(this.foldNode, "class", "gg_nodefold gg_fold " + (this.canHazChildren ? "gg_unfolded" : "gg_nofold"));
                    }

                    this.updateFoldVisibility();

                    cb && cb();
                });

                var left = 0;
                var self = this;

                dojo.forEach(this.children, function (re) {
                    if (re && !re.visible) { //collapse if no wrapper node available
                        left += 1;
                        re.setCollapsed(false, dojo.hitch(self, function () {
                            left -= 1;
                            if (left == 0) {
                                allChildrenCallback();
                                left = -1; //make sure callback is not fired twice if setCollapsed is executed synchronously...
                            }
                        }));
                    }
                });
                if (left == 0) {
                    allChildrenCallback();
                }
            }
        },

        _setupColumns: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.setupColumns");
            this._colNodes = [];

            for (var i = 0, col = null; col = this.tree.columns[i]; i++) {
                if (col.appliesTo(this)) {
                    var span = mxui.dom.create("span", { "class": "gg_column gg_column_" + i });
                    this._colNodes.push(span);
                    this.dataNode.appendChild(mxui.dom.create("span", { "class": "gg_column_wrapper" }, span)); //wrapper column for hovers and such

                    col.setupNode(span);
                }
            }
        },

        draw: function (firstTime) {
            logger.debug("TreeView.widget.TreeView.RenderNode.draw");
            var curCol = 0;
            for (var i = 0, col = null; col = this.tree.columns[i]; i++) {
                if (col.appliesTo(this)) {
                    col.render(this, this._colNodes[curCol], firstTime);
                    curCol += 1;
                }
            }
        },

        free: function () {
            logger.debug("TreeView.widget.TreeView.RenderNode.free");
            if (this._destroyed)
                return;
            this._destroyed = true;

            if (this.tree.getSelection() == this) {
                this.tree.setSelection(this.parent ? this.parent : null);
            }

            dojo.forEach(this.children, function (edge) {
                if (edge) {
                    edge.free();
                }
            });

            if (this.parent) {
                this.getEdge().remove(this); //this will destroy the domNode as well
            } else if (this.domNode) {
                dojo.destroy(this.domNode);
            }
        }
    });
});
