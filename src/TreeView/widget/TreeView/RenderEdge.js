/**
 * Rendering of a group of children
 */
define([
    "dojo/_base/declare",
    "TreeView/widget/TreeView/RenderNode"
], function (declare, RenderNode) {
    "use strict";

    return declare("TreeView.widget.TreeView.RenderEdge", null, {
        parent: null, //rendernode
        type: null, //assoc type definition
        domNode: null,
        tree: null,
        children: null, //array with children
        childNode: null, //ul with the children
        collapsed: null,
        isEdge: true,
        visible: false,

        constructor: function (parentRenderNode, type) {
            logger.debug("TreeView.widget.TreeView.RenderEdge.constructor");
            this.parent = parentRenderNode;
            this.type = type;
            this.tree = this.parent.tree;
            this.children = [];

            var childNode = this.childNode = mxui.dom.create("ul", { "class": "gg_assoc_children gg_assoc_" + type.assoc.replace(".", "_") });
            var wrapperNode = this.domNode = mxui.dom.create("li", { "class": "gg_assoc_wrapper " + type.assocclazz });

            this.visible = type.showassocname;
            if (this.visible) {
                var fold = this.foldNode = mxui.dom.create("span", {});
                var caption = mxui.dom.create("span", { "class": "gg_assoc_title gg_assoc_" + type.assoc.replace(".", "_") }, type.assoccaption);
                var div = new mxui.dom.create("div", { "class": "gg_row", "style": type.assocstyle }, fold, caption);
                dojo.place(div, wrapperNode);

                dojo.addClass(childNode, "gg_assoc_wrapped");
                dojo.addClass(wrapperNode, "gg_node"); //only identify as node if a wrappernode is available

                mxui.dom.data(wrapperNode, "ggdata", this);
            }

            this.setCollapsed(true);

            dojo.place(childNode, wrapperNode);
            dojo.place(wrapperNode, this.parent.childNode);

            if (this.tree.expandall > this.parent.depth)
                this.setCollapsed(false);
        },

        isA: function (type) {
            //logger.debug("TreeView.widget.TreeView.RenderEdge.isA");
            return false; //assoc node is never a type
        },

        getChildCount: function () {
            logger.debug("TreeView.widget.TreeView.RenderEdge.getChildCount");
            return this.children.length;
        },

        add: function (renderNode) {
            logger.debug("TreeView.widget.TreeView.RenderEdge.add");
            var guid = renderNode.graphNode.guid;
            this.children.push(renderNode);
            this.childNode.appendChild(renderNode.domNode);

            this.updateFoldVisibility();
        },

        remove: function (renderNode) {
            logger.debug("TreeView.widget.TreeView.RenderEdge.remove");
            var baseidx = dojo.indexOf(this.children, renderNode);
            if (baseidx > -1) {
                this.children.splice(baseidx, 1);
                if (renderNode.domNode)
                    dojo.destroy(renderNode.domNode);
            }

            this.updateFoldVisibility();
        },

        move: function (renderNode, newindex) {
            logger.debug("TreeView.widget.TreeView.RenderEdge.move");
            var baseidx = dojo.indexOf(this.children, renderNode);
            if (baseidx != -1 && baseidx != newindex) {
                this.children.splice(baseidx, 1);
                this.children.splice(newindex, 0, renderNode);
                this.tree.moveNode(renderNode.domNode, newindex);
            }
        },

        placeChildren: function () {
            logger.debug("TreeView.widget.TreeView.RenderEdge.placeChildren");
            var edges = this.tree.getChildEdges(this.parent.graphNode)[this.type.index];
            for (var childguid in edges) {
                var found = false;
                for (var i = 0; i < this.children.length; i++)
                    if (this.children[i].graphNode.guid == childguid) {
                        found = true;
                        break;
                    }

                if (!found) {
                    new RenderNode(this.tree.dict[childguid], this.parent, this.type);
                }
            }
        },

        setCollapsed: function (collapsed, cb) {
            logger.debug("TreeView.widget.TreeView.RenderEdge.setCollapsed");
            if (this.collapsed !== collapsed) {
                this.collapsed = collapsed;

                //collapse
                if (collapsed) {
                    dojo.style(this.childNode, "display", "none");
                    if (this.foldNode) //if wrapper node not visible, there is no foldnode..
                        dojo.attr(this.foldNode, "class", "gg_assocfold gg_fold gg_folded");
                    cb && cb();
                }

                //expand
                else {
                    dojo.style(this.childNode, "display", "block");
                    if (this.foldNode) //if wrapper node not visible, there is no foldnode..
                        dojo.attr(this.foldNode, "class", "gg_assocfold gg_fold gg_loading");

                    this.parent.graphNode.ensureChildren(this.type, dojo.hitch(this, function () {
                        if (!this.collapsed) { //user might have clicked collapse again
                            dojo.style(this.childNode, "display", "block");
                            if (this.foldNode) //if wrapper node not visible, there is no foldnode..
                                dojo.attr(this.foldNode, "class", "gg_assocfold gg_fold gg_unfolded");
                        }


                        //place the children (might not be done automatically if we were expanding an already loaded item)
                        this.placeChildren();

                        this.updateFoldVisibility();

                        cb && cb();
                    }));
                }

            }
            else
                cb && cb();
        },

        updateFoldVisibility: function () {
            logger.debug("TreeView.widget.TreeView.RenderEdge.updateFoldVisibility");
            if (this.foldNode) {
                if (this.children.length == 0) {
                    dojo.style(this.foldNode, "visibility", "hidden");
                } else {
                    dojo.style(this.foldNode, "visibility", "");
                }
            }
            this.parent.updateFoldVisibility();
        },

        getVisibleParent: function () {
            logger.debug("TreeView.widget.TreeView.RenderEdge.getVisibleParent");
            return this.parent;
        },

        free: function () {
            logger.debug("TreeView.widget.TreeView.RenderEdge.free");
            if (this._destroyed) {
                return;
            }
            this._destroyed = true;

            for (var i = this.children.length - 1; i >= 0; i--) {
                this.children[i].free();
            }

            if (this.domNode) {
                dojo.destroy(this.domNode);
            }
        }
    });
});
