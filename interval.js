const axios = require("axios");
const cheerio = require("cheerio");

const util = require('util')
const http = require('http')
const url = require('url')

const client = require('prom-client');
const { exit } = require("process");
const { table } = require("console");
const collectDefaultMetrics = client.collectDefaultMetrics;
const Registry = client.Registry;
const register = new Registry();

// collectDefaultMetrics({ register });

register.setDefaultLabels({
  app: 'alberta-energy'
})

const poolprice_stats = new client.Gauge({
  name: 'poolprice',
  help: 'Pool price per MWh'
});
register.registerMetric(poolprice_stats);

const generation_mc_stats = new client.Gauge({
    name: 'generation_mc',
    help: 'Generation Maximum Capacity',
    labelNames: ['group']
  });
register.registerMetric(generation_mc_stats);

const generation_tng_stats = new client.Gauge({
    name: 'generation_tng',
    help: 'Generation Total Net Generation',
    labelNames: ['group']
  });
register.registerMetric(generation_tng_stats);

const generation_dnc_stats = new client.Gauge({
    name: 'generation_dnc',
    help: 'Generation Dispatched (and Accepted) Contingency Reserve',
    labelNames: ['group']
  });
register.registerMetric(generation_dnc_stats);

// ##############

const interchange_stats = new client.Gauge({
    name: 'interchange',
    help: 'Interchange Actual Flow',
    labelNames: ['location']
  });
register.registerMetric(interchange_stats);

// ##############

const mc_stats = new client.Gauge({
  name: 'mc_stats',
  help: 'Maximum Capacity',
  labelNames: ['type','category','asset',]
});
register.registerMetric(mc_stats);

const tng_stats = new client.Gauge({
  name: 'tng_stats',
  help: 'Total Net Generation',
  labelNames: ['type','category','asset',]
});
register.registerMetric(tng_stats);

const dcr_stats = new client.Gauge({
  name: 'dcr_stats',
  help: 'Dispatched Contingency Reserve',
  labelNames: ['type','category','asset',]
});
register.registerMetric(dcr_stats);

function captureInterchangeMetrics(stat_object) {
  // console.log(stat_object);
  for ( key in stat_object) {
    let asset_name = key;
    let metric_value = parseInt(stat_object[key]);
    if ( ! isNaN(metric_value) ) { 
      interchange_stats.set({location: asset_name },metric_value);
    }
  }
  
}

function captureMetrics(stat_object,asset_type,category) { 
  // console.log(stat_object);
  for ( key in stat_object) {
    let asset_name = key;
    let asset_category = category || "";
    let mc_metric_value = parseInt(stat_object[key]["MC"]);
    let tng_metric_value = parseInt(stat_object[key]["TNG"]);
    let dcr_metric_value = parseInt(stat_object[key]["DCR"]);
    
    if ( !isNaN(mc_metric_value) ) {
      mc_stats.set({asset: asset_name, type: asset_type, category: asset_category },mc_metric_value);
    }
    if ( !isNaN(tng_metric_value) ) {
      tng_stats.set({asset: asset_name, type: asset_type, category: asset_category },tng_metric_value);
    }
    if ( !isNaN(dcr_metric_value) ) {
      dcr_stats.set({asset: asset_name, type: asset_type, category: asset_category },dcr_metric_value);
    }
  }
  // metric.set({asset: asset_name, type: asset_type, category: category },mc_stat);
}

// Helper Function(s)
function isUpperCase(str) {
  return str === str.toUpperCase();
}

async function getCurrentPoolPrice() {
  let response = await axios( { url: "https://www.aeso.ca/ets/ets.json", 
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' }});

  var data = response.data;
  // console.log(data);
  if ( data.poolprice && data.poolprice instanceof Array && data.poolprice.length > 0 && data.poolprice[data.poolprice.length -1][1]) {
    poolprice_stats.set(data.poolprice[data.poolprice.length -1][1]);  
  } else { 
    console.log('Error setting pool price',data.poolprice);
  }
  // poolprice_stats.set(data.poolprice[data.poolprice.length -1][1]);
  // console.log(data.poolprice[data.poolprice.length -1][1]);
}

async function getCurrentStats() {
    let response = await axios( { url: "http://ets.aeso.ca/ets_web/ip/Market/Reports/CSDReportServlet", 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' }});
    // console.log("Response:", response.data);
    var data = response.data;
    var $ = cheerio.load(data);
    var aeso_stats_array = {};

    function summary_table_parser(table_to_parse) {
      // console.log('SUMMARY')
      let stats_array = {}

      table_to_parse.each(function (i, elem) {
        if ( i > 1 ) {
          let row_data = $(this).children('td').toArray()
          // console.log( $(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_"), parseInt($(row_data[1]).text()) );
          stats_array[$(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_")] = $(row_data[1]).text()
        }

      });
      // console.log(stats_array);
      return stats_array;
    }

    // ###### Parse the generation table type
    function generation_table_parser(table_to_parse) {
      // console.log('generation')
      let stats_array = {}

      table_to_parse.each(function (i, elem) {
        if ( i > 1 ) {
          let row_data = $(this).children('td').toArray()
          stats_array[$(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_")] = { 'MC': $(row_data[1]).text(), 'TNG': $(row_data[2]).text(), 'DCR': $(row_data[3]).text() }
          // console.log( $(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_"), parseInt($(row_data[1]).text()) );
        }

      });

      return stats_array;
    }

    // ###### Parse the interchange table type
    function interchange_table_parser(table_to_parse) {
      // console.log('interchange')
      let stats_array = {}

      table_to_parse.each(function (i, elem) {
        if ( i > 1 ) {
          let row_data = $(this).children('td').toArray()
          // console.log( $(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_"), parseInt($(row_data[1]).text()) );
          stats_array[$(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_")] = $(row_data[1]).text()
        }

      });
      // console.log(stats_array);
      return stats_array;
    }

    // ###### Parse the gas table type
    function gas_table_parser(table_to_parse) {
      // console.log('gas')
      let stats_array = { 'Simple': {}, 'Cogeneration': {}, 'Combined': {} };
      table_to_parse.each(function (i, elem) {
        
        let row_data = $(this).children('td').toArray()
        // let row_name = $(row_data[0]).text().replace(/[^a-zA-Z0-9 ]/g, "").replace(/ /g,"_");
        let row_name = $(row_data[0]).text();
        switch (row_name) {
          case 'Simple Cycle':
            active = 'Simple'
            break;
          case 'Cogeneration':
            active = 'Cogeneration'
            break;
          case 'Combined Cycle':
            active = 'Combined'
            break;
       
          default:
            break;
        }

        if ( row_data.length > 1 && $(row_data[0]).text() != "ASSET" ) {
          // console.log(i,active,row_name);
          let asset_name = $(row_data[0]).text();
          let mc_stat  = parseInt($(row_data[1]).text()); 
          let tng_stat = parseInt($(row_data[2]).text());
          let dnr_stat = parseInt($(row_data[3]).text());
          if ( isNaN(mc_stat) || isNaN(tng_stat) || isNaN(dnr_stat) ) { 
            console.log("ERROR",asset_name,mc_stat,tng_stat,dnr_stat);
          } else { 
            stats_array[active][$(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_")] = { 'MC': $(row_data[1]).text(), 'TNG': $(row_data[2]).text(), 'DCR': $(row_data[3]).text() }
            // gas_tng_stats.set({asset: asset_name, type: `${active}` },tng_stat);
            // gas_dnc_stats.set({asset: asset_name, type: `${active}` },dnr_stat);
          }
          
        } 
      
      });
      // console.log(stats_array);
      return stats_array;
    }

    // ###### Parse the default table type
    function default_table_parser(table_to_parse) {
      // console.log('default','-',electricity_type)
      let stats_array = {}

      table_to_parse.each(function (i, elem) {
        if ( i > 1 ) {
          let row_data = $(this).children('td').toArray()
          // console.log( $(row_data[0]).text(),parseInt($(row_data[1]).text()),parseInt($(row_data[2]).text()),parseInt($(row_data[3]).text()) );
          stats_array[$(row_data[0]).text().replace(/[^\w\s]/gi, '').replace(/ /g,"_")] = { 'MC': $(row_data[1]).text(), 'TNG': $(row_data[2]).text(), 'DCR': $(row_data[3]).text() }
        }
        
      });
      // console.log(stats_array);
      return stats_array;
    }

    var the_tables = $('table [border="1"]')
    the_tables.each(function (i, elem) {
      var table_title = $(this).find('tr').first().text().trim().toLowerCase().trim().replace(/ /g,"_");
      // console.log(table_title);

      var table_data = $(this).find('tr');
      switch (table_title.toLowerCase()) {
        case 'summary':
          aeso_stats_array[table_title] = summary_table_parser(table_data)
          break;
        case 'generation':
          aeso_stats_array[table_title] = generation_table_parser(table_data)
          break;
        case 'interchange':
          aeso_stats_array[table_title] = interchange_table_parser(table_data)
          captureInterchangeMetrics(aeso_stats_array[table_title]);
          break;
        case 'gas':
          aeso_stats_array[table_title] = gas_table_parser(table_data)
          // console.log(aeso_stats_array[table_title]);
          captureMetrics(aeso_stats_array[table_title]["Combined"],table_title,"Combined");
          captureMetrics(aeso_stats_array[table_title]["Cogeneration"],table_title,"Cogeneration");
          captureMetrics(aeso_stats_array[table_title]["Simple"],table_title,"Simple");
          break; 
        default:
          aeso_stats_array[table_title] = default_table_parser(table_data,table_title)
          captureMetrics(aeso_stats_array[table_title],table_title);
          break;
      }

      
      // console.log('--------------');

    });
    // console.log(aeso_stats_array)
    console.log('----------------------');
    // process.exit();
} 

function callStatsScraperEveryNSeconds(n) {
    setInterval(getCurrentStats, n * 1000);
}

function callPoolPriceEveryNSeconds(n) {
  setInterval(getCurrentPoolPrice, n * 1000);
}

getCurrentPoolPrice();
callPoolPriceEveryNSeconds(300);

getCurrentStats();
callStatsScraperEveryNSeconds(120);


const server = http.createServer(async (req, res) => {
    // Retrieve route from request object
    const route = url.parse(req.url).pathname
    
    if (route === '/metrics') {
      // Return all metrics the Prometheus exposition format
      res.setHeader('Content-Type', register.contentType)
      let data = await register.metrics();
      res.end(data);

    }
  })

  // Start the HTTP server which exposes the metrics on http://localhost:8080/metrics
  server.listen(8080)