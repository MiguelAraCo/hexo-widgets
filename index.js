"use strict";

const deAsync = require( "deasync" );
const jsDOM = require( "jsdom" );
const ejs = require( "ejs" );
const glob = require( "glob" );
const path = require( "path" );
const fs = require( "fs" );

hexo.extend.helper.register( "render_widgets", ( html, sidebarEnabled ) => {
	let result = {
		html: "",
		error: null
	};

	jsDOM.env({
		html: html,
		done: function (error, window) {
			if( error ) {
				result.error = error;
				return;
			}

			processDOM( window, sidebarEnabled ).then( () => {
				result.html = window.document.querySelector( "html" ).outerHTML;
			}).catch( ( error ) => {
				result.error = error;
				console.error( error );
			});
		}
	});

	// Hexo doesn't support asynchronous helpers so we need to convert the asynchronous action to a synchronous
	deAsync.loopWhile(() => ! result.html && ! result.error );

	return "<!DOCTYPE html>" + result.html;
} );

function processDOM( window ) {
	const document = window.document;
	const $ = document.querySelector.bind( document );
	const $$ = document.querySelectorAll.bind( document );

	const _ = {
		$: $,
		$$: $$
	};

	let widgets = glob.sync( hexo.theme.base + "widgets/*.js" ).map( ( file ) => {
		return require( path.resolve( file ) );
	});

	let widgetPromises = [];
	for( let widget of widgets ) {
		let elements = $$( widget.selector );

		for (let i = 0; i < elements.length; ++i) {
			let element = elements[i];
			let widgetData = {};
			let widgetPromise = widget.preRender( element, widgetData, document, _ ).then( () => {
				// TODO: Use readFile instead of readFileSync
				// TODO: Reject the promise if there is no template or templateURL defined
				// TODO: Allow templateURL outside of the base (or even local to the widget file)
				let widgetTemplate = "template" in widget ? widget.template : "templateURL" in widget ? fs.readFileSync( hexo.theme.base + "widgets/" + widget.templateURL ).toString() : "";

				element.outerHTML = ejs.render( widgetTemplate, widgetData );
			} );

			widgetPromises.push( widgetPromise );
		}
	}

	return Promise.all( widgetPromises );
}
