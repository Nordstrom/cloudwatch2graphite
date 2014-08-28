var dateFormat = require('dateformat');
var _ = require('lodash');

require('./lib/date');
var global_options = require('./lib/options.js').readCmdOptions();

var cloudwatch = require('aws2js').load('cloudwatch', global_options.credentials.accessKeyId, global_options.credentials.secretAccessKey);

cloudwatch.setRegion(global_options.region_name);

var metrics = global_options.metrics_config.metrics

for(index in metrics) {
	getStatsFor(metrics[index],global_options.region_name);
}

function handleResponse(metric, error, response) {

  if(error) {
    console.error("ERROR ! ",error);
    return;
  }
  if (! response.GetMetricStatisticsResult) {
    console.error("ERROR ! response.GetMetricStatisticsResult is undefined for metric " + metric.name);
    return;
  }
  if (!response.GetMetricStatisticsResult.Datapoints) {
    console.error("ERROR ! response.GetMetricStatisticsResult.Datapoints is undefined for metric " + metric.name);
    return;
  }

  var memberObject = response.GetMetricStatisticsResult.Datapoints.member;
  if (memberObject == undefined) {
    console.error("WARNING ! no data point available for metric " + metric.name);
    return;
  }

  var dataPoints;
  if(memberObject.length === undefined) {
    dataPoints = [memberObject];
  } else {
    // samples might not be sorted in chronological order
    dataPoints = memberObject.sort(function(m1,m2){
      var d1 = new Date(m1.Timestamp), d2 = new Date(m2.Timestamp);
      return d1 - d2
    });
  }

  // Very often in Cloudwtch the last aggregated point is inaccurate and might be updated 1 or 2 minutes later
  // this is not a problem if we choose to overwrite it into graphite, so we read the 3 last points.
  if (dataPoints.length > global_options.metrics_config.numberOfOverlappingPoints) {
    dataPoints = dataPoints.slice(dataPoints.length-global_options.metrics_config.numberOfOverlappingPoints, dataPoints.length);
  }

  for (var point in dataPoints) {
    console.log("%s %s %s", metric.name, dataPoints[point][metric["Statistics.member.1"]], parseInt(new Date(dataPoints[point].Timestamp).getTime() / 1000.0));
  }
}

function allPossibleCases(arr) {
  if (arr.length === 0) {
    return [];
  } 
  else if (arr.length ===1){
    return arr[0];
  }
  else {
    var result = [];
    var allCasesOfRest = allPossibleCases(arr.slice(1));  // recur with the rest of array
    for (var c in allCasesOfRest) {
      // console.log(allCasesOfRest[c]);
      for (var i = 0; i < arr[0].length; i++) {
        result.push([arr[0][i], allCasesOfRest[c]]);
      }
    }
    return result;
  }
}

function getStatsFor(metric, regionName) {
	var interval = 11;

	var now = new Date();
	var then = (interval).minutes().ago()

	if ( metric.Namespace.match(/Billing/) ) {
	    then.setHours(then.getHours() - 30)
	}

	var end_time = dateFormat(now, "isoUtcDateTime");
	var start_time = dateFormat(then, "isoUtcDateTime");


	metric.options = {
		Namespace: metric.Namespace,
		MetricName: metric.MetricName,
		Period: '60',
		StartTime: start_time,
		EndTime: end_time,
		"Statistics.member.1": metric["Statistics.member.1"],
		Unit: metric.Unit,
	}

  if ( metric.Namespace.match(/Billing/) ) {
    metric.options["Period"] = '28800'
  }

	metric.name = (global_options.metrics_config.carbonNameSpacePrefix != undefined) ? global_options.metrics_config.carbonNameSpacePrefix + "." : "";
	metric.name = metric.name.replace("{regionName}",regionName);
	
	metric.name += metric.Namespace.replace("/", ".");

  var sub_metrics = [];

  var new_dimensions = [];
  //
  // terribly ugly code. Don't judge me!
  // the point of all this is to allow for multiple
  // dimensions to be listed in an array of dimensions
  // and then we can easily get the same metrics 
  // accross multiple dimensions!!
  //
  // Mostly used for the TableName dimension.
  //
  metric.dimensions.forEach(function(dimension, index) {
    dimension["index"] = index + 1;
    var set = [];
    if(_.isArray(dimension['value'])) {
      dimension['value'].forEach(function(val) {
        
        var new_dim = {}
        new_dim["name"] = dimension["name"]
        new_dim["value"] = val
        new_dim["index"] = dimension['index']

        set.push(new_dim)
      });
    } else {
      set.push(dimension)
    }
    new_dimensions.push(set);
  });

  metric.dimensions = new_dimensions;

  var all_dimension_combos = allPossibleCases(metric.dimensions);
  if(!_.isArray(all_dimension_combos)) {
    all_dimension_combos = [all_dimension_combos];
  }

  all_dimension_combos.forEach(function(combo) {
    if(!_.isArray(combo)) {
      combo = [combo];
    }

    var a_metric = _.clone(metric, true);
    combo.forEach(function(dim) {
      a_metric.options["Dimensions.member." + (dim.index) + ".Name"] = dim['name'];
      a_metric.options["Dimensions.member." + (dim.index) + ".Value"] = dim['value'];
      a_metric.name += "." + dim.value;
    });
    sub_metrics.push(a_metric);
  });

  sub_metrics.forEach(function(a_metric) {
    a_metric.name += "." + a_metric.MetricName;
    a_metric.name += "." + a_metric["Statistics.member.1"];
    a_metric.name += "." + a_metric.Unit;

    a_metric.name = a_metric.name.toLowerCase();

    cloudwatch.request('GetMetricStatistics', a_metric.options, function(error,response) {
      handleResponse(a_metric, error, response);
    });
  })

}
