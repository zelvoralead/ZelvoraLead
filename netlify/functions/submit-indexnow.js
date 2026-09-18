// Submits every URL in the sitemap to IndexNow (Bing, Yandex and other
// participating engines) so new/changed pages get picked up fast, instead
// of waiting for the next crawl. Google doesn't use IndexNow — keep using
// Search Console's "Request Indexing" for Google.
//
// Usage: after deploying, visit https://zelvoralead.co.za/.netlify/functions/submit-indexnow
// in a browser once. That's it — no login, no dashboard needed.

const HOST = 'zelvoralead.co.za';
const KEY = 'd3b3128816ed17bcb4a1b37e0ef9ecd5'; // matches /d3b3128816ed17bcb4a1b37e0ef9ecd5.txt at site root — do not change one without the other

const URLS = [
  'https://zelvoralead.co.za/',
  'https://zelvoralead.co.za/tools/google-business-profile-grader.html',
  'https://zelvoralead.co.za/tools/missed-call-calculator.html',
  'https://zelvoralead.co.za/tools/marketing-budget-calculator.html',
  'https://zelvoralead.co.za/tools/customer-lifetime-value-calculator.html',
  'https://zelvoralead.co.za/privacy-policy',
  'https://zelvoralead.co.za/terms'
];

exports.handler = async () => {
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList: URLS
      })
    });

    return {
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: `IndexNow submission sent. Response status: ${res.status} (200/202 = accepted). Submitted ${URLS.length} URLs.`
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'text/plain' }, body: 'IndexNow submission failed: ' + err.message };
  }
};
