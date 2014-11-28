dojo.provide("TreeView.widget.GridView");
dojo.require("TreeView.widget.Commons");
dojo.require("dojo.NodeList-traverse");


dojo.declare("TreeView.widget.Colhead", null, {
	domNode : null, //correspinding render nodes
	grid : null,


	constructor : function(data, grid) {
		this.grid = grid;
		this.data = data;

	},

	setup : function(rownode) {
		this.domNode = mxui.dom[this.grid.showasdiv ? "div" : "th"]({
			'class': 'gv_th gv_th_'
				+ (1 + this.data.colindex)
				+ (this.data.colheadname ? ' gv_th_' + this.data.colheadname.replace(/\W+/g,"") : '')
				+ (this.data.colheadsortattr ? ' gv_th_sortable' : ' gv_th_unsortable')
		});
		if (this.data.colheadwidth)
			dojo.style(this.domNode, 'width', this.getWidth());

		//sort caption?
		if (this.data.colheadcaption)
			dojo.place(mendix.dom.span({'class' : 'gv_sort_caption'}, this.data.colheadcaption), this.domNode);

		//show sort arrow?
		if (this.getSortAttr())
			dojo.place(mendix.dom.span({'class' : 'gv_sort_arrow'}), this.domNode);


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

dojo.declare("TreeView.widget.Record", null, {
	domNode : null, //correspinding render nodes
	grid : null,
	guid : null,

	_data : null,
	_subscription : null,
	_colNodes : null, //array with columnNodes
	_subs : null,
	checkbox : null, //checkbox node

	constructor : function(data, grid) {
		this.guid = data.getGUID();
		this._data = data;
		this._colNodes = [];
		this._subs = [];

		this.grid = grid;

		this._subscription = mx.processor.subscribe({
			guid : this.guid,
			callback : dojo.hitch(this, function(thing) {
				//Do not update while suspended; all data will be fetch upon resume.
				if (this.grid.isSuspended())
					return;

				if (this.grid.datasourcemf) {
					//microflow data? retrieve by id
					mx.processor.get({
						guid: this.guid,
						callback : dojo.hitch(this, function(data) {
							this.update(data);
						}),
						error : grid.showError
					});
				}
				else {
					//xpath datasource? retrieve by xpath, the object might no longer be in the grid constraint
					mx.processor.get({
						xpath : grid.buildXpath() + "[id = '"+this.guid+"']",
						filter   : grid.enableschema ? grid._schema : {},
						callback : dojo.hitch(this, function (data) {
							if (data.length > 0)
								this.update(data[0]);
						}),
						error: grid.showError
					});
				}
			})
		});

	},

	data : function() {
		return this._data;
	},

	update : function(data, firstTime) {
		this._data = data;

		var curCol = 0;
		for(var i = 0, col = null; col = this.grid.columns[i]; i++) {
			var node = this._colNodes[curCol];
			col.render(this, node, firstTime === true);
			curCol += 1;
		}

		for (var key in this.grid.conditions) {
			var condition = this.grid.conditions[key];
			var clz = condition.getClass();
			if (clz) { //checking if class is cheaper than checking the condition itself
				if (condition.appliesTo(this))
					dojo.addClass(this.domNode, clz);
				else
					dojo.removeClass(this.domNode, clz);
			}
		}
	},

	setup : function(tablenode) {
		this.domNode = mendix.dom[this.grid.showasdiv ? "div" : "tr"]({ 'class' : 'gv_row gv_row_' + tablenode.childElementCount });

		if (this.grid.showasdiv && this.grid.colheads.length > 0 && this.grid.colheads[0].getWidth())
			dojo.style(this.domNode, 'width', this.grid.colheads[0].getWidth());

		mxui.dom.data(this.domNode, "data", this);

		this.checkbox = mendix.dom.input( {
			'type' : 'checkbox',
			'class' : 'gv_multiselect_checkbox',
			'style' : this.grid.allowmultiselect === true ? '' : 'display:none'
		});

		dojo.place(mendix.dom[this.grid.showasdiv ? "div" : "td"]({
			'class' : 'gv_cell gv_cell_0 gv_cell_multiselect'
		}, this.checkbox), this.domNode);

		//create td's
		for (var i = 0; i < this.grid.colheads.length; i++) {
			var cell = mendix.dom[this.grid.showasdiv ? "div" : "td"]({
				'class' : 'gv_cell gv_cell_' + this.grid.colheads[i].data.colheadname + ' gv_cell_' + i
			});
			var colwrapper = mendix.dom.div({ 'class' : 'gv_cell_wrapper'});

			dojo.place(colwrapper, cell);
			dojo.place(cell, this.domNode);
		}

		//create renderers
		for(i = 0, col= null; col = this.grid.columns[i]; i++) {
			if (1 * col.columnindex >= this.grid.colheads.length)
				this.configError("Column index out of bounds: " + col.columnindex);

			var span = mxui.dom.span({'class' : 'gv_column gv_column_' + i});
			this._colNodes.push(span);

			//wrapper node
			var cw = mxui.dom.span({ 'class' : 'gv_column_wrapper' }, span);
			dojo.place(cw, this.domNode.childNodes[1 + 1 * col.columnindex].children[0]);

			col.setupNode(span);
		}

		this.update(this._data, true);
		dojo.place(this.domNode, tablenode);
	},

	addSubscription : function(subscription) {
		this._subs.push(subscription);
	},

	free : function() {
			if (this._destroyed)
					return;
			this._destroyed = true;

			dojo.forEach(this.subs, function(sub) {
				dojo.disconnect(sub);
			});

			dojo.destroy(this.domNode);

			if (this._subscription)
					mx.processor.unsubscribe(this._subscription);

	}

});

mxui.widget.declare("TreeView.widget.GridView", {

	_multiSelection : null,
	_inMultiSelectMode : false, //is true as long only checkboxes are clicked
	_hoveredRow :  null,
	_started : false,
	_suspended : false,
	_iscallingdatasource : false,
	contextGUID : null,

	currentSortColumn : -1,
	sortInverted : false,
	count : 0,
	curpage : 0,
        firstUpdate: true,

	saveAndFireSelection : function(item) {

		this.updatePaging(); //update selected items label

		if (this.selectionref || this.selectionrefset) {
			mx.processor.save({
				mxobj : this.contextObject,
				callback : dojo.hitch(this, this.onSelect, item),
				error : this.showError
			}, this);

			mx.processor.objectUpdateNotification(this.contextObject);
		}

		this.onSelect(item);
	},

	hasSelection : function() {
		return this._multiSelection.length > 0;
	},

	hasMultiSelection : function() {
		return this._multiSelection.length > 1;
	},

	getSelection : function() {
		return this._multiSelection;
	},

	getLastSelection : function() {
		return (this.hasSelection()
		? this._multiSelection[this._multiSelection.length -1]
		: null);
	},

	withSelection : function(scope, cb) {
		dojo.forEach(this._multiSelection, cb, scope);
	},


	addToSelection : function(item, noevents) {
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
				TreeView.widget.Commons.store(this.contextObject, this.selectionref,    item.guid);

			if (this.selectionrefset)
				TreeView.widget.Commons.store(this.contextObject, this.selectionrefset, item.guid, "add");

			this.saveAndFireSelection(item);
		}
	},

	removeFromSelection : function(item, noevents) {
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
				TreeView.widget.Commons.store(this.contextObject, this.selectionref,  lastitem ? lastitem.guid : null);

			if (this.selectionrefset)
				TreeView.widget.Commons.store(this.contextObject, this.selectionrefset, item.guid, "rem");

			this.saveAndFireSelection(lastitem);
		}
	},

	setSelection : function(item) {
		//the same selection?
		if (!item && !this.hasSelection ||
			item && this._multiSelection.length === 1 && this._multiSelection[0] === item)
			return;

		this._inMultiSelectMode = false;

		while(this.hasSelection())
			this.removeFromSelection(this.getLastSelection(), true);

		if (item)
			this.addToSelection(item, true);

		if (this.selectionref)
			TreeView.widget.Commons.store(this.contextObject, this.selectionref,    item && item.guid);

		if (this.selectionrefset)
			TreeView.widget.Commons.store(this.contextObject, this.selectionrefset, item && item.guid);

		this.saveAndFireSelection(item);
	},

	multiSelectClick : function(node, e) {
		var record = this.getRowForNode(node);
		/*var ms = this._multiSelection;

		//clicking the current selection and selection length = 1?, reenable selection
		if (ms.length == 1 && ms[0] == record) {
			node.checked = true;
		}

		else {*/
			if (node.checked)
				this.addToSelection(record);

			else
				this.removeFromSelection(record);
		//}

		this._inMultiSelectMode = this._multiSelection.length > 0;

		return false; //no propagation
	},

	getRecordByGuid : function(guid) {
		for(var i = 0; i < this.records.length; i++)
			if (this.records[i].guid == guid)
				return this.records[i];
		return null;
	},

	/** tries to read the selection data from the context object, and apply it*/
	updateSelectionFromContext : function() {
		var guids = [];

		if (this.selectionref) {
			var guid = TreeView.widget.Commons.getObjectAttr(this.contextObject, this.selectionref);
			if (guid)
				guids.push(guid);
		}
		if (this.selectionrefset) {
			guids = guids.concat(TreeView.widget.Commons.getObjectAttr(this.contextObject, this.selectionrefset));
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

	/* context applied */
	_contextSubscription : null,

	getContextGUID : function() {
		return this.contextGUID;
	},

	getContextObject : function() {
		return this.contextObject;
	},

	/**
		called by mxclient whenever context is replaced
	*/
	update : function(data, cb) {
		TreeView.widget.Commons.normalizeContext(data, dojo.hitch(this, function(object, guid) {
			//use the new context
			this.contextObject = object;
			this.contextGUID = guid;
			this.listenToContext();

			//reload
			this.resetAndFetchAll(dojo.hitch(this, this.updateSelectionFromContext));
		}));

		cb && cb();
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

	listenToContext : function() {
		//if reload on context change is enabled, reload as soon as the context object is altered
		if (this.refreshoncontext) {
			if (this._contextSubscription)
				mx.processor.unsubscribe(this._contextSubscription);

			if (this.contextGUID) {
				this._contextSubscription = mx.processor.subscribe({
					guid: this.contextGUID,
					callback : dojo.hitch(this, function() {
						if (!this._iscallingdatasource)
							this.resetAndFetchAll(dojo.hitch(this, this.updateSelectionFromContext));
					})
				});
			}
		}
	},

	resetAndFetchAll : function(cb) {
		if (!this.isSuspended()) {
			this.curpage = 0;
			this.fetchAll(cb);
		}
	},

	fetchAll : function(cb) {
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
		var contextObject = this.contextObject;
		var filter = '';
		if (this.searchenabled)
			filter = this.searchControl.searchInput.getValue();

		contextObject.set(this.datasourceoffsetattr, this.curpage * this.pagesize);
		contextObject.set(this.datasourcelimitattr, this.pagesize);
		contextObject.set(this.datasourcesearchattr, filter && filter != this.searchplaceholder ? filter : '');

		var self = this;

		mx.processor.save({
			mxobj : contextObject,
			callback : function(){
				self._iscallingdatasource = true;
				mx.data.action({
					params : {
						actionname : self.datasourcemf,
						applyto     : "selection",
						guids : ["" + contextObject.getGUID()]
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
		mx.processor.get(args);
	},

	buildXpath : function () {
		var xpath = '//' + this.entity + this.constraint.replace(/\[\%CurrentObject\%\]/gi, this.contextGUID);

		if (this.searchControl) {
			if (!this.searchAttrs)
				this.searchAttrs = dojo.map(dojo.filter(this.columns, function(column) {
					return column.columnissearchattr && column.columnattr;
				}), function(column) {
					return column.columnattr;
				});

			xpath += this.searchControl.getSearchConstraints(this.searchAttrs);
		}

		xpath += this.filterManager.getSearchConstraints();
		return xpath;
	},

	processData : function(cb, data, count) {
		this.count = (dojo.isObject(count) ? count.count : count)*1; //Mx 3 returns primitive, Mx 4 an aggregate object
		this.updatePaging();

		dojo.forEach(this.records, function(record){
			record.free();
		});

		this.records = [];

		function handleElem(data) {
			var r = new TreeView.widget.Record(data, this);
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
				dojo.place(mendix.dom.a({ 'class' : 'gv_btn_prev'}, "<"), this.pagingNode);

			//page 1
			dojo.place(mendix.dom.a({ 'class' : 'gv_btn_page ' + (0 === this.curpage ? 'gv_btn_page_active' : '')}, "1"), this.pagingNode);

			//paging skipper?
			if (this.curpage > PAGERSIZE)
				dojo.place(mendix.dom.a({ 'class' : 'gv_btn_paging_spacer'}, ".."), this.pagingNode);

			for(var i = Math.max(this.curpage - PAGERSIZE + 1, 1); i < Math.min(this.curpage + PAGERSIZE , lastpage); i++)
				dojo.place(mendix.dom.a({ 'class' : 'gv_btn_page ' + (i === this.curpage ? 'gv_btn_page_active' : '')}, "" + (i + 1)), this.pagingNode);

			//paging skipper?
			if (this.curpage < lastpage - PAGERSIZE)
					dojo.place(mendix.dom.a({ 'class' : 'gv_btn_paging_spacer'}, ".."), this.pagingNode);

			//last page
			dojo.place(mendix.dom.a({ 'class' : 'gv_btn_page ' + (lastpage === this.curpage ? 'gv_btn_page_active' : '')}, "" + (lastpage + 1)), this.pagingNode);

			//show next btn?
			if (this.curpage < lastpage)
				dojo.place(mendix.dom.a({ 'class' : 'gv_btn_next'}, ">"), this.pagingNode);

		}

		if (this.count === 0) {
			dojo.place(mendix.dom.span({'class' : 'gv_empty_message'}, this.emptymessage), this.pagingNode);
		}
		else if (this.showtotals)
			dojo.place(mendix.dom.span({'class' : 'gv_paging_totals'},
				(this.itemcountmessage || (this._multiSelection.length > 1 ? "{1} of {0} item(s) selected." : "{0} item(s) in total")).replace("{0}", this.count).replace("{1}", this._multiSelection.length)
			), this.pagingNode);
	},

	pagingClick : function(e) {
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
		if (this.gridNode.childNodes.length > 1)
			this.setSelection(this.getRowForNode(this.gridNode.childNodes[1]));
		else
			this.setSelection(null);
	},

        setDefaultSelection: function(){
            if (this.selectfirstrow) {
                this.selectFirstItem();
            }
        },

	/*


	UI Events


	*/

	grabStartupFocus : function() {
		if (this.searchenabled)
			mxui.wm.focus.put(this.searchControl.searchInput.textbox);
		else
			this.grabFocus();
	},

	grabFocus : function() {
		if (mxui.wm.focus.get() !== this.gridNode)
			mxui.wm.focus.put(this.gridNode);
	},

	setupEvents : function() {
		var lc = TreeView.widget.Commons.liveConnect;

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
				this.setCurrentSortColumn(this._getIndex(node) - 1);
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
				currentcolhover = this._getIndex(target);
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

	_getIndex : function(node) {
		return typeof node.cellIndex === "number" ? node.cellIndex : dojo.query(node.parentNode).children().indexOf(node);
	},

	keypress : function(e) {
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
		if (handled)
			dojo.stopEvent(e);
	},

	invokeDefaultAction : function() {
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
		if (!node)
			return null;
		if (dojo.hasClass(node, "gv_row")) // EvdP: yes, functionality now depends on a classname, but this can only be avoided by using parentNode, which is errorprone for changes.
			return mxui.dom.data(node, "data");
		return this.getRowForNode(node.parentNode);
	},

	labelClick : function(node) {
		var isClose = dojo.hasClass(node, 'gv_label_close');
		node = node.parentNode;

		//assuming dataset: { owner: record, guid : guid, dataset: this.columneditdataset, colindex: this.colindex }
		var data = mendix.dom.data(node, "data");
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
		var col = mxui.dom.data(node, 'colindex');
		var record = this.getRowForNode(node);

		this.columns[col].invokeAction(record);
	},

	setCurrentSortColumn : function(index) {
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


	/*



	HouseHolding



	*/

	inputargs : {
		//data model properties
		tabindex : -1,
		entity : '',
		datasourcemf : '',
		datasourceoffsetattr : '',
		datasourcelimitattr  : '',
		datasourcecountattr  : '',
		datasourcesearchattr : '',
		constraint : '',

		//display properties
		colheadname : '',
		colheadcaption : '',
		colheadwidth : '',
		colheadsortattr : '',
		colheadsortdir : '',

		//rendering properties
		columnindex : '',
		columnname : '',
		columndataset : '',
		columnrendermode: '',
		columnattr  : '',
		columnimage: '',
		columnaction: '',
		columnclazz: '',
		columnstyle: '',
		columndateformat: '',
		columnissearchattr : '',
		columntruecaption  : '',
		columnfalsecaption : '',
		columneditable  : '',
		columneditdataset : '',
		columneditautocommit : '',
		columnonchangemf : '',
		columncondition : '',
		columnprefix : '',
		columnpostfix: '',

		//action properties
		actname : '',
		actshowbutton : '',
		actclassname  : '',
		actautohide : '',
		actbuttoncaption : '',
		actbuttonimage : '',
		actmf : '',
		actmultimf : '',
		actisdefault : '',
		actonselect  : '',
		actconfirmtext : '',
//		actonselect : '',
		actnoselectionmf : '',
		actdataset : '',
		actappliestomultiselection : '',
		actprogressmsg : '',
//		actshortcut : '',

		//filters
		filterattr : '',
		filtertruecaption    : '',
		filterfalsecaption   : '',
		filterbooleandefault : '',

		//advanced settings
		allowmultiselect  : false,
		allowsingleselect : true,
		selectfirstrow    : false,
		defaultsortcolumn : 0,
		pagesize : 20,
		refreshoncontext  : false,
		refreshonclass    : true,
		searchenabled     : true,
		searchplaceholder : '',
		searchlabeldataset: '',
		realtimesearch    : false,
		emptymessage      : '',
		selectionref      : '',
		selectionrefset   : '',
		colheaderenabled  : true,
		enableschema      : true,
		showtotals        : true,
		itemcountmessage  : '',
		showasdiv         : false,
		listenchannel     : '',
		singleclickdefaultaction : false,

		//related datasets
		relname             : '',
		rellabel            : '',
		relentity           : '',
		relcontextassoc     : '',
		relitemassocref     : '',
		relitemassocrefset  : '',
		relnameattr         : '',
		relnewitemcaption   : '',
		relconstraint       : '',

		//conditions
		condname   : '',
		condattr   : '',
		condvalues : '',
		condclass  : ''

	},

	startup : function() {
		if (this._started) //MWE: RVH said this can happen
			return;

		TreeView.widget.Commons.fixObjProps(this, ["blaat0", "blaat2", "blaat3", "blaat4", "blaat7", "blaat8"])

		this._started = true;
		this.records = [];
		this._multiSelection = [];

		this.columns = [];
		this.colheads = [];
		this.conditions = {};
		this.actions = [];

		this.actionsByName = {};


		this.verifyDatasourceSettings();

		this.setupDatasets();
		this.setupConditions();

		this.setupLayout();
		this.setupColumns();

		this.setupActions();

		this.setupRendering();
		this.setupEvents();


		if (this.refreshonclass)
			this.subscribe({
				'entity' : this.entity,
				callback : dojo.hitch(this, function() {
					this.fetchAll();
				})
			});

		if (this.searchenabled) {
			this.searchControl = new TreeView.widget.SearchControl({
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

		this.setupFilters();

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
	
		this.actLoaded();

		//this.grabStartupFocus();
		setTimeout(dojo.hitch(this, this.grabStartupFocus), 200); //grab focus, but with a small timeout, because wm content manager will grab focus at end of startup chain
	},

	verifyDatasourceSettings : function() {
		if (this.datasourcemf) {
			if (!(this.datasourceoffsetattr && this.datasourcelimitattr && this.datasourcecountattr))
				this.configError("Offset, Limit and Count attributes need to be set if a data source microflow is used.");

			if (this.searchenabled && !this.datasourcesearchattr)
				this.configError("Search attribute s need to be set if a data source microflow is used and search is enabled.");

			if (this.defaultsortcolumn != 0)
				this.configError("Sorting is not supported if a data source microflow is used.");

			if (this.relname)
				this.configError("Datasets are not allowed if a datasource microflow is used");

			if (this.filterattr)
				this.configError("Filters are not allowed if a datasource microflow is used");

			if (this.entityConstraint)
				this.configError("An entity constraint and datasource microflow cannot be used at the same time");
		}
	},

	setupLayout : function() {
		dojo.addClass(this.domNode, 'gv_grid');
		if (this.showasdiv)
			dojo.addClass(this.domNode, 'gv_floating_grid');

		this.headerNode = mendix.dom.div({'class' : 'gv_header'});

		this.gridNode = mendix.dom[this.showasdiv ? "div" : "table"]({'class': 'gv_table'});

		this.headerRow = mendix.dom[this.showasdiv ? "div" : "tr"]({'class':'gv_headrow'}, mendix.dom[this.showasdiv ? "div" : "th"]({ 'class' : 'gv_multiselect_column_head gv_th gv_th_0'}));
		var header = mendix.dom[this.showasdiv ? "div" : "thead"]({'class':'gv_gridhead'}, this.headerRow);

		dojo.addClass(this.domNode, this.colheaderenabled ? 'gv_columnheaders' : 'gv_nocolumnheaders');
		dojo.addClass(this.domNode, this.allowmultiselect ? 'gv_multiselect_enabled' : 'gv_multiselect_disabled');

		dojo.place(header, this.gridNode, 'first');

		this.footerNode = mendix.dom.div({'class' : 'gv_footer'});
		this.pagingNode = mendix.dom.div({'class' : 'gv_paging'});
		dojo.place(this.pagingNode, this.footerNode);

		this.searchbarNode = mendix.dom.div({'class' : 'gv_searchnode'});
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



	setupColumns : function() {
		var data = [];
		this.splitPropsTo('colheadname,colheadcaption,colheadwidth,colheadsortattr,colheadsortdir', data);
		for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?
			d.colindex = i;
			var colhead = new TreeView.widget.Colhead(d, this);
			this.colheads.push(colhead);
		}

		dojo.forEach(this.colheads, function(colhead) {
			colhead.setup(this.headerNode);
		}, this);
	},

	setupDatasets : function() {
		this.dataset = {};
		var data = [];
		this.splitPropsTo('relname,rellabel,relnewitemcaption,relentity,relcontextassoc,relitemassocref,relitemassocrefset,relnameattr,relconstraint', data);
		dojo.forEach(data, function(item) {
			if (this.dataset[item.relname])
				this.configError('Related dataset "' + item.relname + '" is defined twice!');
			var r = new TreeView.widget.RelatedDataset(item, this);
			this.dataset[item.relname] = r;
			this.addToSchema((item.relitemassocref || item.relitemassocrefset) + "/" + item.relnameattr);
		}, this);
	},

	setupActions : function() {
		var data = [];
		this.splitPropsTo('actname,actprogressmsg,actshowbutton,actclassname,actautohide,actbuttoncaption,actconfirmtext,actbuttonimage,actmf,actmultimf,actappliestomultiselection,actisdefault,actonselect,actnoselectionmf,actdataset', data);
		for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?

			if (d.actmultimf && !!!d.actmf)
				this.configError(d.actname + ": Actions that define a multi selection microflow need to define a single selection microflow as well. ");

			var action = new TreeView.widget.Action(d, this);

			this.actions.push(action);
			this.actionsByName[action.actname] = action;
		}

		dojo.forEach(this.actions, function(action) {
			action.setup(this.headerNode);
			action.updateToSelection();
		}, this);
	},

	setupConditions : function() {
		var data = [];
		this.splitPropsTo('condname,condattr,condvalues,condclass', data);
		for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?
			var cond = new TreeView.widget.Condition(d, this);
			if (this.conditions[d.condname])
				this.configError("Condition name '" + d.condname + "' is not unique!");

			this.conditions[d.condname] = cond;
			this.addToSchema(d.condattr);
		}
	},

	setupFilters: function() {
		var data = [];
		this.splitPropsTo('filterattr,filtertruecaption,filterfalsecaption,filterbooleandefault', data);

		var fm = this.filterManager = new TreeView.widget.FilterManager(this);

		this.filters = dojo.map(data, function(d) {
			return new TreeView.widget.Filter(d, fm);
		}, this);

		if (this.filters.length > 0)
			dojo.place(fm.domNode, this.actions.length > 0 || !this.searchenabled ? this.headerNode : this.searchbarNode, 'last');
	},

	setupRendering : function() {
		var data = [];
		this.splitPropsTo('columnindex,columnname,columnrendermode,columnattr,columnimage,columneditautocommit,columnonchangemf,columnaction,columnclazz,columnstyle,columnprefix,columnpostfix,columndateformat,columnissearchattr,columntruecaption,columnfalsecaption,columneditdataset,columneditable,columncondition', data);
		for(var i = 0, d = null; d = data[i]; i++) { // EvdP: what kind of weird loop is this? d = data[i] almost seems an error on first sight. Why not just use data.length to check?
			d.columnentity = this.entity;
			this.columns.push(new TreeView.widget.Colrenderer(d, this, i));
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

	_schema : null,
	addToSchema : function( attr) {
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
		TreeView.widget.Commons.error(e, this);
	},

	mf : function(mf, data, callback) {
		TreeView.widget.Commons.mf(mf, data, callback, this);
	},

	configError : function(msg) {
		TreeView.widget.Commons.configError(this, msg);
	},

	splitPropsTo : function(props, target) {
		TreeView.widget.Commons.splitPropsTo(this, props, target);
	},

	uninitialize : function() {
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
	}
});