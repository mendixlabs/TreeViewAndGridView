define([
    "dojo/_base/declare",
], function(declare) {
    "use strict"

    return declare("TreeView.widget.GridView.ColHead", null, {
        domNode : null, //correspinding render nodes
        grid : null,

        constructor : function(data, grid) {
            logger.debug("TreeView.widget.GridView.ColHead.constructor");
            this.grid = grid;
            this.data = data;

        },

        setup : function(rownode) {
            logger.debug("TreeView.widget.GridView.ColHead.setup");
            this.domNode = mxui.dom.create(this.grid.showasdiv ? "div" : "th", {
                'class': 'gv_th gv_th_' +
                (1 + this.data.colindex) +
                (this.data.colheadname ? ' gv_th_' + this.data.colheadname.replace(/\W+/g,"") : '') +
                (this.data.colheadsortattr ? ' gv_th_sortable' : ' gv_th_unsortable')
            });
            if (this.data.colheadwidth)
                dojo.style(this.domNode, 'width', this.getWidth());

            //sort caption?
            if (this.data.colheadcaption)
                dojo.place(mxui.dom.create("span", {'class' : 'gv_sort_caption'}, this.data.colheadcaption), this.domNode);

            //show sort arrow?
            if (this.getSortAttr())
                dojo.place(mxui.dom.create("span", {'class' : 'gv_sort_arrow'}), this.domNode);


            dojo.place(this.domNode, this.grid.headerRow);
        },

        getWidth : function() {
            return this.data.colheadwidth;
        },

        getSortAttr : function() {
            return this.data.colheadsortattr;
        },

        getSortDir  : function() {
            return this.data.colheadsortdir;
        },

        free : function() {
        }
    });
});
