/*global history */
sap.ui.define([
	"ZXDEGUI0011/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem",
	"sap/ui/Device",
	"ZXDEGUI0011/model/formatter",
	"sap/m/MessageBox",
	"ZXDEGUI0011/model/grouper",
	"ZXDEGUI0011/model/GroupSortState",
	"sap/m/MessageToast"
], function(BaseController, JSONModel, Filter, FilterOperator, GroupHeaderListItem, Device, formatter, MessageBox, grouper,
	GroupSortState, MessageToast) {
	"use strict";

	return BaseController.extend("ZXDEGUI0011.controller.Master", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit: function() {
			// Control state model
			var oList = this.byId("list"),
				oViewModel = this._createViewModel(),
				// Put down master list's original value for busy indicator delay,
				// so it can be restored later on. Busy handling on the master list is
				// taken care of by the master list itself.
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();
			this._oListSelector = this.getOwnerComponent().oListSelector;
			this._oGroupSortState = new GroupSortState(oViewModel, grouper.Basamt(this.getResourceBundle()));

			this._oList = oList;
			// keeps the filter and search state
			this._oListFilterState = {
				aFilter: [],
				aSearch: []
			};

			this.setModel(oViewModel, "masterView");
			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oList.attachEventOnce("updateFinished", function() {
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});

			this.getView().addEventDelegate({
				onBeforeFirstShow: function() {
					this._oListSelector.setBoundMasterList(oList);
				}.bind(this)
			});

			this.getRouter().getRoute("master").attachPatternMatched(this._onMasterMatched, this);
			this.getRouter().attachBypassed(this.onBypassed, this);
			this._oODataModel = this.getOwnerComponent().getModel();
		},

		onScanForValue: function(oEvent) {

			var that = this;

			if (!this._oScanDialog) {
				this._oScanDialog = new sap.m.Dialog({
					title: "Scan barcode",
					contentWidth: "640px",
					contentHeight: "480px",
					horizontalScrolling: false,
					verticalScrolling: false,
					stretchOnPhone: true,
					content: [new sap.ui.core.HTML({
						id: this.createId("scanContainer"),
						content: "<div />"
					})],
					endButton: new sap.m.Button({
						text: "Cancel",
						press: function(oEvent) {
							this._oScanDialog.close();
						}.bind(this)
					}),
					afterOpen: function() {
						// TODO: Investigate why Quagga.init needs to be called every time...possibly because DOM 
						// element is destroyed each time dialog is closed
						this._initQuagga(this.getView().byId("scanContainer").getDomRef()).done(function() {
							// Initialisation done, start Quagga

							Quagga.start();
						}).fail(function(oError) {
							// Failed to initialise, show message and close dialog...this should not happen as we have
							// already checked for camera device ni /model/models.js and hidden the scan button if none detected

							MessageBox.error(oError.message.length ? oError.message : ("Failed to initialise Quagga with reason code " + oError.name), {
								onClose: function() {
									this._oScanDialog.close();
								}.bind(this)
							});
						}.bind(this));
					}.bind(this),
					afterClose: function() {
						// Dialog closed, stop Quagga

						Quagga.stop();

						var resultCode = that.getView().byId("searchField").getValue();
						var strLength = resultCode.length - 1;
						resultCode = resultCode.substring(0, strLength);
						that._oListFilterState.aFilter.push(new Filter("Uuid", FilterOperator.Contains, resultCode));
						that._applyFilterSearch();

					}
				});

				this.getView().addDependent(this._oScanDialog);
			}

			this._oScanDialog.open();
		},

		_initQuagga: function(oTarget) {
			var oDeferred = jQuery.Deferred();

			// Initialise Quagga plugin - see https://serratus.github.io/quaggaJS/#configobject for details
			Quagga.init({
				inputStream: {
					type: "LiveStream",
					target: oTarget,
					constraints: {
						width: {
							min: 640
						},
						height: {
							min: 480
						},
						facingMode: "environment"
					}
				},
				locator: {
					patchSize: "medium",
					halfSample: true
				},
				numOfWorkers: 2,
				frequency: 10,
				decoder: {
					readers: [{
						format: "code_128_reader",
						config: {}
					}]
				},
				locate: true
			}, function(error) {
				if (error) {
					oDeferred.reject(error);
				} else {
					oDeferred.resolve();
				}
			});

			if (!this._bQuaggaEventHandlersAttached) {
				// Attach event handlers...

				Quagga.onProcessed(function(result) {
					var drawingCtx = Quagga.canvas.ctx.overlay,
						drawingCanvas = Quagga.canvas.dom.overlay;

					if (result) {
						// The following will attempt to draw boxes around detected barcodes
						if (result.boxes) {
							drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
							result.boxes.filter(function(box) {
								return box !== result.box;
							}).forEach(function(box) {
								Quagga.ImageDebug.drawPath(box, {
									x: 0,
									y: 1
								}, drawingCtx, {
									color: "green",
									lineWidth: 2
								});
							});
						}

						if (result.box) {
							Quagga.ImageDebug.drawPath(result.box, {
								x: 0,
								y: 1
							}, drawingCtx, {
								color: "#00F",
								lineWidth: 2
							});
						}

						if (result.codeResult && result.codeResult.code) {
							Quagga.ImageDebug.drawPath(result.line, {
								x: 'x',
								y: 'y'
							}, drawingCtx, {
								color: 'red',
								lineWidth: 3
							});
						}
					}
				}.bind(this));

				Quagga.onDetected(function(result) {
					// Barcode has been detected, value will be in result.codeResult.code. If requierd, validations can be done 
					// on result.codeResult.code to ensure the correct format/type of barcode value has been picked up

					// Set barcode value in input field
					this.getView().byId("searchField").setValue(result.codeResult.code);

					this._oScanDialog.close();
				}.bind(this));

				// Set flag so that event handlers are only attached once...
				this._bQuaggaEventHandlersAttached = true;
			}

			return oDeferred.promise();
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * After list data is available, this handler method updates the
		 * master list counter and hides the pull to refresh control, if
		 * necessary.
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished: function(oEvent) {
			// update the master list object counter after new data is loaded
			this._updateListItemCount(oEvent.getParameter("total"));
			// hide pull to refresh if necessary
			this.byId("pullToRefresh").hide();
			this._findItem();
			this.getModel("appView").setProperty("/addEnabled", true);
		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch: function(oEvent) {

			this._oListFilterState.aFilter = [];

			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");

			if (sQuery) {
				this._oListFilterState.aSearch = [new Filter("Uuid", FilterOperator.Contains, sQuery)];
			} else {
				this._oListFilterState.aSearch = [];
			}
			this._applyFilterSearch();

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh: function() {
			this._oList.getBinding("items").refresh();
		},

		/**
		 * Event handler for the sorter selection.
		 * @param {sap.ui.base.Event} oEvent the select event
		 * @public
		 */
		onSort: function(oEvent) {
			var sKey = oEvent.getSource().getSelectedItem().getKey(),
				aSorters = this._oGroupSortState.sort(sKey);

			var SORTKEY = sKey;
			var DESCENDING = true;
			var GROUP = false;
			var aSorter2 = [];

			aSorter2.push(new sap.ui.model.Sorter(SORTKEY, DESCENDING, GROUP));
			this._applyGroupSort(aSorter2);

			//			this._applyGroupSort(aSorters);
		},

		/**
		 * Event handler for the grouper selection.
		 * @param {sap.ui.base.Event} oEvent the search field event
		 * @public
		 */
		onGroup: function(oEvent) {
			var sKey = oEvent.getSource().getSelectedItem().getKey(),
				aSorters = this._oGroupSortState.group(sKey);

			this._applyGroupSort(aSorters);
		},

		/**
		 * Event handler for the filter button to open the ViewSettingsDialog.
		 * which is used to add or remove filters to the master list. This
		 * handler method is also called when the filter bar is pressed,
		 * which is added to the beginning of the master list when a filter is applied.
		 * @public
		 */
		onOpenViewSettings: function() {
			if (!this._oViewSettingsDialog) {
				this._oViewSettingsDialog = sap.ui.xmlfragment("ZXDEGUI0011.view.ViewSettingsDialog", this);
				this.getView().addDependent(this._oViewSettingsDialog);
				// forward compact/cozy style into Dialog
				this._oViewSettingsDialog.addStyleClass(this.getOwnerComponent().getContentDensityClass());
			}
			this._oViewSettingsDialog.setFilterSearchOperator(sap.m.StringFilterOperator.Contains);
			this._oViewSettingsDialog.open();

		},

		/**
		 * Event handler called when ViewSettingsDialog has been confirmed, i.e.
		 * has been closed with 'OK'. In the case, the currently chosen filters
		 * are applied to the master list, which can also mean that the currently
		 * applied filters are removed from the master list, in case the filter
		 * settings are removed in the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @public
		 */
		onConfirmViewSettingsDialog: function(oEvent) {

			var aFilterItems = oEvent.getParameters().filterItems,
				aFilters = [],
				aCaptions = [];
			/*
			// update filter state:
			// combine the filter array and the filter string
	
			aFilterItems.forEach(function(oItem) {
				switch (oItem.getKey()) {
					case "Filter1":
						aFilters.push(new Filter("Basamt", FilterOperator.LE, 100));
						break;
					case "Filter2":
						aFilters.push(new Filter("Basamt", FilterOperator.GT, 100));
						break;

					default:
						break;
				}
				aCaptions.push(oItem.getText());
			});
			*/
			var aContexts = oEvent.getParameter("filterCompoundKeys");
			var aBukrs = aContexts.Bukrs;
			for (var kData in aBukrs) {
				var zCheck = aBukrs[kData];
				if (zCheck === true) {
					aFilters.push(new Filter("Bukrs", FilterOperator.EQ, kData));
					aCaptions.push("Company Code = " + kData);
				}
			}

			var aKunnr = aContexts.Kunnr;
			for (var kData2 in aKunnr) {
				var zCheck2 = aKunnr[kData2];
				if (zCheck2 === true) {
					aFilters.push(new Filter("Kunnr", FilterOperator.EQ, kData2));
					aCaptions.push("Customer = " + kData2);
				}
			}

			var aGuino = aContexts.Guino;
			for (var kData3 in aGuino) {
				var zCheck3 = aGuino[kData3];
				if (zCheck3 === true) {
					aFilters.push(new Filter("Guino", FilterOperator.EQ, kData3));
					aCaptions.push("Invoice = " + kData3);
				}
			}

			var aBupla = aContexts.Bupla;
			for (var kData4 in aBupla) {
				var zCheck4 = aBupla[kData4];
				if (zCheck4 === true) {
					aFilters.push(new Filter("Bupla", FilterOperator.EQ, kData4.substr(4, 4)));
					aFilters.push(new Filter("Bukrs", FilterOperator.EQ, kData4.substr(0, 4)));
					aCaptions.push("Business place = " + kData4);
				}
			}

			this._oListFilterState.aFilter = aFilters;
			this._updateFilterBar(aCaptions.join(", "));
			this._applyFilterSearch();
		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange: function(oEvent) {
			var that = this;
			var oItem = oEvent.getParameter("listItem") || oEvent.getSource();
			var fnLeave = function() {
				that._oODataModel.resetChanges();
				that._showDetail(oItem);
			};
			if (this._oODataModel.hasPendingChanges()) {
				this._leaveEditPage(fnLeave);
			} else {
				this._showDetail(oItem);
			}
			that.getModel("appView").setProperty("/addEnabled", true);
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 * @public
		 */
		onBypassed: function() {
			this._oList.removeSelections(true);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader: function(oGroup) {
			return new GroupHeaderListItem({
				title: oGroup.text,
				upperCase: false
			});
		},

		/**
		 * Navigates back in the browser history, if the entry was created by this app.
		 * If not, it navigates to the Fiori Launchpad home page
		 * @override
		 * @public
		 */
		onNavBack: function() {
			var oHistory = sap.ui.core.routing.History.getInstance(),
				sPreviousHash = oHistory.getPreviousHash(),
				oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");

			if (sPreviousHash !== undefined) {
				// The history contains a previous entry
				history.go(-1);
			} else {
				// Navigate back to FLP home
				oCrossAppNavigator.toExternal({
					target: {
						shellHash: "#Shell-home"
					}
				});
			}
		},

		/**
		 * Event handler  (attached declaratively) called when the add button in the master view is pressed. it opens the create view.
		 * @public
		 */
		onAdd: function() {
			this.getModel("appView").setProperty("/addEnabled", false);
			this.getRouter().getTargets().display("create");

		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Creates the model for the view
		 * @private
		 */
		_createViewModel: function() {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				delay: 0,
				title: this.getResourceBundle().getText("masterTitleCount", [0]),
				noDataText: this.getResourceBundle().getText("masterListNoDataText"),
				sortBy: "Guino",
				groupBy: "None"
			});
		},

		/**
		 * Ask for user confirmation to leave the edit page and discard all changes
		 * @param {object} fnLeave - handles discard changes
		 * @param {object} fnLeaveCancelled - handles cancel
		 * @private
		 */
		_leaveEditPage: function(fnLeave, fnLeaveCancelled) {
			var sQuestion = this.getResourceBundle().getText("warningConfirm");
			var sTitle = this.getResourceBundle().getText("warning");

			MessageBox.show(sQuestion, {
				icon: MessageBox.Icon.WARNING,
				title: sTitle,
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				onClose: function(oAction) {
					if (oAction === MessageBox.Action.OK) {
						fnLeave();
					} else if (fnLeaveCancelled) {
						fnLeaveCancelled();
					}
				}
			});
		},

		/**
		 * If the master route was hit (empty hash) we have to set
		 * the hash to to the first item in the list as soon as the
		 * listLoading is done and the first item in the list is known
		 * @private
		 */
		_onMasterMatched: function() {

			this._oListSelector.oWhenListLoadingIsDone.then(
				function(mParams) {
					if (mParams.list.getMode() === "None") {
						return;
					}
					this.getModel("appView").setProperty("/addEnabled", true);

					if (!mParams.list.getSelectedItem()) {
						this.getRouter().navTo("object", {
							Uuid: encodeURIComponent(mParams.firstListitem.getBindingContext().getProperty("Uuid"))
								//		Bukrs: encodeURIComponent(mParams.firstListitem.getBindingContext().getProperty("Bukrs")),
								//		Gjahr: encodeURIComponent(mParams.firstListitem.getBindingContext().getProperty("Gjahr")),
								//		Belnr: encodeURIComponent(mParams.firstListitem.getBindingContext().getProperty("Belnr")),
								//		Buzei: encodeURIComponent(mParams.firstListitem.getBindingContext().getProperty("Buzei"))
						}, true);
					}
				}.bind(this),
				function(mParams) {
					if (mParams.error) {
						return;
					}
					this.getRouter().getTargets().display("detailNoObjectsAvailable");
				}.bind(this)
			);
		},

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showDetail: function(oItem) {
			var bReplace = !Device.system.phone;
			this.getRouter().navTo("object", {
				Uuid: encodeURIComponent(oItem.getBindingContext().getProperty("Uuid"))
					//		Bukrs: encodeURIComponent(oItem.getBindingContext().getProperty("Bukrs")),
					//		Gjahr: encodeURIComponent(oItem.getBindingContext().getProperty("Gjahr")),
					//		Belnr: encodeURIComponent(oItem.getBindingContext().getProperty("Belnr")),
					//		Buzei: encodeURIComponent(oItem.getBindingContext().getProperty("Buzei"))
			}, bReplace);
		},

		/**
		 * Sets the item count on the master list header
		 * @param {integer} iTotalItems the total number of items in the list
		 * @private
		 */
		_updateListItemCount: function(iTotalItems) {
			var sTitle;
			// only update the counter if the length is final
			if (this._oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("masterTitleCount", [iTotalItems]);
				this.getModel("masterView").setProperty("/title", sTitle);
			}
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch: function() {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
				oViewModel = this.getModel("masterView");
			this._oList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataWithFilterOrSearchText"));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataText"));
			}
		},

		/**
		 * Internal helper method to apply both group and sort state together on the list binding
		 * @private
		 */
		_applyGroupSort: function(aSorters) {
			this._oList.getBinding("items").sort(aSorters);
		},

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {string} sFilterBarText the selected filter value
		 * @private
		 */
		_updateFilterBar: function(sFilterBarText) {
			var oViewModel = this.getModel("masterView");
			oViewModel.setProperty("/isFilterBarVisible", (this._oListFilterState.aFilter.length > 0));
			oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("masterFilterBarText", [sFilterBarText]));
		},

		/**
		 * Internal helper method that adds "/" to the item's path 
		 * @private
		 */
		_fnGetPathWithSlash: function(sPath) {
			return (sPath.indexOf("/") === 0 ? "" : "/") + sPath;
		},

		formatterCountDate: function(value) {

			if ((value != null) && (value != "0000-00-00"))

			{

				if (value) {

					var oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
						pattern: "yyyy/MM/dd"
					});

					return oDateFormat.format(new Date(value));

				} else {
					return value;
				}

			} else return "";

		},

		onScan: function() {
			var input = this.byId("searchField");

			try {
				window.parent.cordova.plugins.barcodeScanner.scan(
					function(result) {
						setTimeout(function() {
							MessageToast.show("We got a barcode\n" +
								"Result: " + result.text + "\n" +
								"Format: " + result.format + "\n" +
								"Cancelled: " + result.cancelled);
						}, 1000);

						input.setValue(result.text);
						input.fireSearch({
							refreshButtonPressed: false,
							query: result.text
						});

					},
					function(error) {
						MessageToast.show("Scanning failed: " + error);
					},
					// options object
					{
						"preferFrontCamera": false,
						"showFlipCameraButton": true,
						"orientation": "landscape"
					}

				);
			} catch (err) {
				var error = true;
				MessageToast.show('error: ' + err.message);
			}
			if (error !== true) {
				MessageToast.show("Start Scan", {
					closeOnBrowserNavigation: false
				});
			}

		},
		/**
		 * It navigates to the saved itemToSelect item. After delete it navigate to the next item. 
		 * After add it navigates to the new added item if it is displayed in the tree. If not it navigates to the first item.
		 * @private
		 */
		_findItem: function() {
			var itemToSelect = this.getModel("appView").getProperty("/itemToSelect");
			if (itemToSelect) {
				var sPath = this._fnGetPathWithSlash(itemToSelect);
				var oItem = this._oListSelector.findListItem(sPath);
				if (!oItem) { //item is not viewable in the tree. not in the current tree page.
					oItem = this._oListSelector.findFirstItem();
					if (oItem) {
						sPath = oItem.getBindingContext().getPath();
					} else {
						this.getRouter().getTargets().display("detailNoObjectsAvailable");
						return;
					}
				}
				this._oListSelector.selectAListItem(sPath);
				this._showDetail(oItem);
			}
		}

	});
});