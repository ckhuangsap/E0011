jQuery.sap.require("sap.ui.qunit.qunit-css");
jQuery.sap.require("sap.ui.thirdparty.qunit");
jQuery.sap.require("sap.ui.qunit.qunit-junit");
QUnit.config.autostart = false;

// We cannot provide stable mock data out of the template.
// If you introduce mock data, by adding .json files in your webapp/localService/mockdata folder you have to provide the following minimum data:
// * At least 3 ZXDGUI_S0011LS_UI5Set in the list

sap.ui.require([
	"sap/ui/test/Opa5",
	"ZXDEGUI0011/test/integration/pages/Common",
	"sap/ui/test/opaQunit",
	"ZXDEGUI0011/test/integration/pages/App",
	"ZXDEGUI0011/test/integration/pages/Browser",
	"ZXDEGUI0011/test/integration/pages/Master",
	"ZXDEGUI0011/test/integration/pages/Detail",
	"ZXDEGUI0011/test/integration/pages/Create",
	"ZXDEGUI0011/test/integration/pages/NotFound"
], function(Opa5, Common) {
	"use strict";
	Opa5.extendConfig({
		arrangements: new Common(),
		viewNamespace: "ZXDEGUI0011.view."
	});

	sap.ui.require([
		"ZXDEGUI0011/test/integration/MasterJourney",
		"ZXDEGUI0011/test/integration/NavigationJourney",
		"ZXDEGUI0011/test/integration/NotFoundJourney",
		"ZXDEGUI0011/test/integration/BusyJourney",
		"ZXDEGUI0011/test/integration/FLPIntegrationJourney"
	], function() {
		QUnit.start();
	});
});