jQuery.sap.require("sap.ui.qunit.qunit-css");
jQuery.sap.require("sap.ui.thirdparty.qunit");
jQuery.sap.require("sap.ui.qunit.qunit-junit");
QUnit.config.autostart = false;

sap.ui.require([
	"sap/ui/test/Opa5",
	"ZXDEGUI0011/test/integration/pages/Common",
	"sap/ui/test/opaQunit",
	"ZXDEGUI0011/test/integration/pages/App",
	"ZXDEGUI0011/test/integration/pages/Browser",
	"ZXDEGUI0011/test/integration/pages/Master",
	"ZXDEGUI0011/test/integration/pages/Detail",
	"ZXDEGUI0011/test/integration/pages/NotFound"
], function(Opa5, Common) {
	"use strict";
	Opa5.extendConfig({
		arrangements: new Common(),
		viewNamespace: "ZXDEGUI0011.view."
	});

	sap.ui.require([
		"ZXDEGUI0011/test/integration/NavigationJourneyPhone",
		"ZXDEGUI0011/test/integration/NotFoundJourneyPhone",
		"ZXDEGUI0011/test/integration/BusyJourneyPhone"
	], function() {
		QUnit.start();
	});
});