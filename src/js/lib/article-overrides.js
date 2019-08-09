let $ = require('jquery');

let moveElements = {
	init() {
		var $byline = $('.lead-container__social-wrap').parent(),
			$pubDate = $('.pubDate').parent(),
			$parent = $('.parbase.smartbody').eq(0);
		$byline.insertBefore($parent);
		$pubDate.insertBefore($parent);
	}
};

module.exports = moveElements.init;