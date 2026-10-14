"use strict";
var ext_api = chrome || browser;

window.addEventListener("load", function () {
    var opt_in_enabled = document.getElementById('opt-in-enabled');
    bpcStorage.local.get("optIn", function (result) {
        opt_in_enabled.innerText = result.optIn ? 'YES' : 'NO';
    });

    document.getElementById("optin-enable").addEventListener("click", function () {
        bpcStorage.local.set({
            "optIn": true,
            "optInShown": true
        });
        opt_in_enabled.innerText = 'YES';
    });

    document.getElementById("optin-disable").addEventListener("click", function () {
        bpcStorage.local.set({
            "optIn": false,
            "optInShown": true
        });
        opt_in_enabled.innerText = 'NO';
    });

    document.getElementById("button-close").addEventListener("click", function () {
        bpcStorage.local.set({
            "optInShown": true,
            "customShown": true
        });
        window.close();
    });

    var custom_enabled = document.getElementById('custom-enabled');
    ext_api.permissions.contains({
        origins: ["*://*/*"]
    }, function (result) {
        if (result) {
            custom_enabled.innerText = 'YES';
        } else {
            custom_enabled.innerText = 'NO';
        }
    });

    document.querySelector('#custom-enable').addEventListener('click', function (event) {
        ext_api.permissions.request({
            origins: ["<all_urls>"]
        }, function (granted) {
            if (granted) {
                custom_enabled.innerText = 'YES';
                bpcStorage.local.set({
                    "customOptIn": true
                });
            } else {
                custom_enabled.innerText = 'NO';
            }
            bpcStorage.local.set({
                "customShown": true
            });
        });
    });

    document.querySelector('#custom-disable').addEventListener('click', function (event) {
        ext_api.permissions.remove({
            origins: ["<all_urls>"]
        }, function (removed) {
            if (removed) {
                custom_enabled.innerText = 'NO';
                bpcStorage.local.set({
                    "customOptIn": false
                });
            }
            bpcStorage.local.set({
                "customShown": true
            });
        });
    });

    var update_enabled = document.getElementById('update-enabled');
    bpcStorage.local.get({optInUpdate: true}, function (result) {
        update_enabled.innerText = result.optInUpdate ? 'YES' : 'NO';
    });

    document.getElementById("update-enable").addEventListener("click", function () {
        bpcStorage.local.set({
            "optInUpdate": true
        });
        update_enabled.innerText = 'YES';
    });

    document.getElementById("update-disable").addEventListener("click", function () {
        bpcStorage.local.set({
            "optInUpdate": false
        });
        update_enabled.innerText = 'NO';
    });
});
