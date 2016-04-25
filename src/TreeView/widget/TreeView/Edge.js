/**
 * Edge stores a single assocation from the database, e.g. guid -> assocname -> guid.
 * Parent / child is stored according to the rendering, not according to the owner.
 */
define([
    "dojo/_base/declare",
    "TreeView/widget/TreeView/RenderNode"
], function(declare, RenderNode) {
    "use strict"

    return declare("TreeView.widget.TreeView.Edge", null, {
        parent: null, //Graphnode
        name: "", //assocname
        child: null, //Graphnode
        owner: null, //Graphnode, either parent or child
        type: null, //type in tree
        tree: null,
        index: -1,

        constructor: function (type, parent, child, owner) {
            logger.debug("TreeView.widget.Edge.constructor");
            this.type = type;
            this.name = type.assoc;
            this.parent = parent;
            this.child = child;
            this.owner = owner;
            this.tree = this.parent.tree;

            this.child._refs += 1; //increase the number of references

            //add the node for every known parent
            parent.forNodes(function (parentRenderNode) {
                if (parentRenderNode.children[type.index].collapsed == false){ //already expanded parent, add this edge..
                    new RenderNode(child, parentRenderNode, type);
                }
            });
        },

        updateIndex: function (newindex) {
            logger.debug("TreeView.widget.Edge.updateIndex");
            if (this.index != newindex) {
                var edge = this;

                this.parent.forNodes(function (parentNode) {
                    edge.child.forNodes(function (childNode) {
                        parentNode.children[edge.type.index].move(childNode, newindex);
                    });
                });

                this.index = newindex;
            }
        },

        free: function () {
            logger.debug("TreeView.widget.Edge.free");
            if (this._destroyed){
                return;
            }
            this._destroyed = true;

            //1. remove the corresponding child render nodes for every know parent, but only where the parent is the parent of this edge!
            var edge = this;

            //remove every rendering of this parent -> assoc -> child
            this.parent.forNodes(function (parentNode) {
                edge.child.forNodes(function (childNode) {
                    parentNode.children[edge.type.index].remove(childNode);
                });
            });

            //2. reduce the number of refs for child, remove if necessary
            this.child.free();

            //3. Remove edges from the tree cache structure
            this.tree.freeEdge(this);
        }
    });
});
